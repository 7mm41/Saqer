#!/usr/bin/env bash
# Nightly encrypted backup (restic, AES-256): database dump, uploaded files and the .env files.
# Keeps KEEP_DAILY daily snapshots (14 by default). Safe to run any time.
. "$(dirname "$0")/lib.sh"
load_env
load_backup_env

restic_run -- snapshots >/dev/null 2>&1 || { say "Initialising the backup repository"; restic_run -- init; }

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
say "Database"
"${COMPOSE[@]}" exec -T db pg_dump -U katf -d katf -Fc --no-owner \
  | restic_run -i -- backup --stdin --stdin-filename katf.dump --tag db --tag "$stamp" --host katf

say "Uploaded files and settings"
restic_run -v "katf_files:/backup/files:ro" -v "$ENV_FILE:/backup/env/.env:ro" -v "$BACKUP_ENV:/backup/env/backup.env:ro" \
  -- backup /backup --tag files --tag "$stamp" --host katf

say "Pruning (keeping ${KEEP_DAILY:-14} days)"
restic_run -- forget --host katf --keep-daily "${KEEP_DAILY:-14}" --group-by host,tags --prune >/dev/null
restic_run -- check --read-data-subset=5% >/dev/null
say "Backup $stamp done."
