#!/bin/bash
# Installs Sarena's latest version when there is one. It checks the branch this folder
# follows on GitHub; if it moved: an encrypted backup first, then the new files, a
# rebuild and a restart. The site keeps running during the build, and if the new
# version doesn't build or start, the previous one is put back (and that version is
# skipped until a newer one comes).
#
# `sudo bash deploy/install.sh --auto-update` runs this every 10 minutes (cron).
#   bash deploy/update.sh            update now if there is something new
#   bash deploy/update.sh --status   the installed and the latest version, and the recent log
# Log: /var/log/sarena-update.log
set -euo pipefail
cd "$(dirname "$0")/.."

LOG=/var/log/sarena-update.log
STATE=/var/lib/sarena
mkdir -p "$STATE"
# To the log file, and to the screen when run by hand.
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M')" "$1" | tee -a "$LOG"; }
BUILD_LOG="$STATE/last-build.log"

branch=$(git rev-parse --abbrev-ref HEAD)

if [ "${1:-}" = "--status" ]; then
  git fetch --quiet origin "$branch" || echo "Can't reach GitHub (for a private repository: bash deploy/github-access.sh)."
  echo "Installed:   $(git log -1 --format='%h  %cd  %s' --date=format:'%Y-%m-%d %H:%M')"
  echo "On GitHub:   $(git log -1 --format='%h  %cd  %s' --date=format:'%Y-%m-%d %H:%M' "origin/$branch")"
  [ -f /etc/cron.d/sarena-update ] && echo "Automatic updates: on (every 10 minutes)" || echo "Automatic updates: off (sudo bash deploy/install.sh --auto-update)"
  [ -s "$STATE/skip" ] && echo "Skipped (didn't start): $(cut -c1-7 "$STATE/skip")"
  echo; echo "Recent log:"; tail -n 8 "$LOG" 2>/dev/null || echo "  (nothing yet)"
  exit 0
fi

# One update at a time.
exec 9>"$STATE/update.lock"
flock -n 9 || exit 0

if ! git fetch --quiet origin "$branch" 2>/dev/null; then
  log "Can't reach GitHub. If the repository is private: bash deploy/github-access.sh"
  exit 1
fi
old=$(git rev-parse HEAD)
new=$(git rev-parse "origin/$branch")
[ "$old" = "$new" ] && exit 0
[ "$(cat "$STATE/skip" 2>/dev/null)" = "$new" ] && exit 0

healthy() {
  docker compose exec -T app node -e \
    "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1
}
started() {
  for _ in $(seq 1 60); do healthy && return 0; sleep 2; done
  return 1
}
restore() {
  log "$1 Going back to ${old:0:7}. Details: $BUILD_LOG"
  git reset --hard --quiet "$old"
  docker compose up -d --build >>"$BUILD_LOG" 2>&1 || true
  echo "$new" >"$STATE/skip"
  started && log "Back on ${old:0:7}: the site is running." || log "The previous version didn't start either: docker compose logs --tail 60 app"
  exit 1
}

log "Updating ${old:0:7} → ${new:0:7} ($(git log -1 --format=%s "$new"))"
bash deploy/backup.sh >/dev/null 2>&1 || log "Note: the backup before the update didn't run."
if ! git merge --ff-only --quiet "origin/$branch"; then
  log "Files on the server were changed by hand, so the update can't apply. See: git status"
  exit 1
fi
# Builds first; the running site is only replaced once the new version is built.
docker compose up -d --build >"$BUILD_LOG" 2>&1 || restore "The new version didn't build."
started || restore "The new version didn't start."
rm -f "$STATE/skip"
docker image prune -f >/dev/null 2>&1 || true
log "Updated to ${new:0:7}: the site is running."
