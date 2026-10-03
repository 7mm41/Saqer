#!/usr/bin/env bash
# One-command update with automatic rollback:
#   sudo /opt/katf/deploy/update.sh
# 1) takes a backup, 2) pulls the new code, 3) rebuilds, 4) restarts, 5) checks health.
# If the new version is not healthy, the previous images and code come back automatically.
# Database migrations only add things, so the previous version keeps working on the migrated schema;
# if a release says otherwise, restore the pre-update backup with restore.sh.
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
load_env
cd "$DEPLOY_DIR/.." || exit 1

say "Backup before updating"
"$DEPLOY_DIR/backup.sh"

prev="$(git rev-parse HEAD)"
say "Pulling the new version (current: ${prev:0:8})"
git pull --ff-only
next="$(git rev-parse HEAD)"
[[ "$prev" != "$next" ]] || { say "Already up to date."; exit 0; }

for s in api web caddy; do docker image tag "katf-$s:latest" "katf-$s:rollback" 2>/dev/null || true; done

rollback() {
  warn "Update failed — rolling back to ${prev:0:8}"
  git checkout -q "$prev" 2>/dev/null || git reset -q --hard "$prev"
  for s in api web caddy; do docker image tag "katf-$s:rollback" "katf-$s:latest" 2>/dev/null || true; done
  "${COMPOSE[@]}" up -d --no-build
  wait_healthy api 240 && wait_healthy web 120 && say "Rolled back. The site runs the previous version." || warn "Rollback is not healthy either — see docs/runbooks.md"
  exit 1
}
trap rollback ERR

say "Building ${next:0:8}"
"${COMPOSE[@]}" build
say "Restarting"
"${COMPOSE[@]}" up -d
wait_healthy api 240 || false
wait_healthy web 120 || false
curl -fsS --max-time 10 "https://$DOMAIN/api/health" >/dev/null || false
trap - ERR
say "Updated to ${next:0:8}."
