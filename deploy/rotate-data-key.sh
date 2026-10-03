#!/usr/bin/env bash
# Rotates DATA_KEY (the key that encrypts personal data). Takes a backup, stops the app for a minute,
# re-encrypts every field and file under a new key, then restarts. Use it on a schedule or if the key may
# have leaked. Afterwards, update your offline copy of deploy/.env.
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
load_env
[[ -n "${DATA_KEY:-}" ]] || die "DATA_KEY is empty in deploy/.env"

say "Backup first"
"$DEPLOY_DIR/backup.sh"

old="$DATA_KEY"
new="$(rand_hex 32)"
say "Stopping the app"
"${COMPOSE[@]}" stop api web

say "Re-encrypting under the new key"
if ! "${COMPOSE[@]}" run --rm --no-deps -T -e DATA_KEY="$new" -e DATA_KEY_PREVIOUS="$old" api node dist/cli.js rotate-data-key; then
  warn "Rotation failed — nothing was switched; starting with the old key"
  "${COMPOSE[@]}" up -d api web
  exit 1
fi

set_env DATA_KEY "$new"
set_env DATA_KEY_PREVIOUS ""
"${COMPOSE[@]}" up -d api web
wait_healthy api 240 || die "API not healthy after rotation — the old key is in the last backup's env copy"
say "Backup under the new key"
"$DEPLOY_DIR/backup.sh"
say "DATA_KEY rotated. Save the new deploy/.env in your password manager now; the old key is no longer needed."
