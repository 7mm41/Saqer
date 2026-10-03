#!/usr/bin/env bash
# Restore from the encrypted backup.
#   restore.sh --test          restore the latest backup into a throw-away database and check it (safe; run weekly)
#   restore.sh [SNAPSHOT_TAG]  REPLACE the live database and files with a backup (asks for confirmation)
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
load_env
load_backup_env

mode="live"; tag=""
for a in "$@"; do case "$a" in --test) mode="test" ;; *) tag="$a" ;; esac; done
pick() { # latest snapshot id with the given tags
  restic_run -- snapshots --host katf --tag "$1" --latest 1 --json | grep -o '"short_id":"[^"]*"' | tail -1 | cut -d'"' -f4
}
db_snap="$(pick "db${tag:+,$tag}")"
[[ -n "$db_snap" ]] || die "no database backup found${tag:+ for $tag}"
# the files snapshot taken in the same run carries the same timestamp tag
stamp="$(restic_run -- snapshots "$db_snap" --json | grep -o '"tags":\[[^]]*\]' | grep -o '[0-9]\{4\}-[0-9-]*T[0-9]*Z' | head -1)"
files_snap="$([[ -n "$stamp" ]] && pick "files,$stamp" || true)"
# the DATA_KEY that encrypted this backup (it changes after rotate-data-key.sh); kept in memory only
backup_key=""
if [[ -n "$files_snap" ]]; then
  backup_key="$(restic_run -- dump "$files_snap" /backup/env/.env 2>/dev/null | grep '^DATA_KEY=' | head -1 | cut -d= -f2- || true)"
fi
key_for_backup="${backup_key:-$DATA_KEY}"

if [[ "$mode" == "test" ]]; then
  say "Test restore of database snapshot $db_snap into a temporary database"
  net="katf-restore-test-$$"; pgc="katf-restore-pg-$$"; pw="$(rand_hex 16)"
  cleanup() { docker rm -f "$pgc" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  docker network create "$net" >/dev/null
  docker run -d --name "$pgc" --network "$net" -e POSTGRES_DB=katf -e POSTGRES_USER=katf -e POSTGRES_PASSWORD="$pw" postgres:16-alpine >/dev/null
  for _ in $(seq 1 30); do docker exec "$pgc" pg_isready -U katf -d katf >/dev/null 2>&1 && break; sleep 2; done
  restic_run -- dump "$db_snap" katf.dump | docker exec -i "$pgc" pg_restore -U katf -d katf --no-owner --exit-on-error
  rows="$(docker exec "$pgc" psql -U katf -d katf -tAc "select (select count(*) from bookings)||' bookings, '||(select count(*) from ledger_entries)||' ledger rows, '||(select count(*) from audit_log)||' audit rows'")"
  bal="$(docker exec "$pgc" psql -U katf -d katf -tAc "select coalesce(sum(debit),0)=coalesce(sum(credit),0) from ledger_entries")"
  [[ "$bal" == "t" ]] || die "restored ledger does not balance"
  docker run --rm --network "$net" -e NODE_ENV=production -e DATABASE_URL="postgres://katf:$pw@$pgc:5432/katf" -e DATA_KEY="$key_for_backup" -e ADMIN_PATH="$ADMIN_PATH" \
    katf-api:latest node dist/cli.js verify-audit
  [[ -n "$files_snap" ]] && restic_run -- ls "$files_snap" >/dev/null
  say "Restore test passed: $rows; ledger balanced; audit chain verified."
  exit 0
fi

warn "This REPLACES the live database and uploaded files with backup $db_snap${files_snap:+ / $files_snap}."
if [[ -n "$backup_key" && "$backup_key" != "$DATA_KEY" ]]; then
  warn "This backup was encrypted with an earlier DATA_KEY; deploy/.env will be switched to that key."
fi
read -rp "Type RESTORE to continue: " ok
[[ "$ok" == "RESTORE" ]] || die "cancelled"

say "Safety backup of the current state first"
"$DEPLOY_DIR/backup.sh" || warn "safety backup failed — continuing because you confirmed"

"${COMPOSE[@]}" stop api web caddy
say "Database"
"${COMPOSE[@]}" exec -T db psql -U katf -d postgres -c "drop database if exists katf_restore" -c "create database katf_restore owner katf"
restic_run -- dump "$db_snap" katf.dump | "${COMPOSE[@]}" exec -T db pg_restore -U katf -d katf_restore --no-owner --exit-on-error
"${COMPOSE[@]}" exec -T db psql -U katf -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='katf'" \
  -c "drop database katf" -c "alter database katf_restore rename to katf"
if [[ -n "$files_snap" ]]; then
  say "Uploaded files"
  restic_run -v "katf_files:/backup/files" -- restore "$files_snap" --target / --include /backup/files --delete
fi
if [[ -n "$backup_key" && "$backup_key" != "$DATA_KEY" ]]; then
  set_env DATA_KEY "$backup_key"
  set_env DATA_KEY_PREVIOUS ""
fi
"${COMPOSE[@]}" up -d
wait_healthy api 240 || die "API not healthy after restore — see logs"
say "Restored $db_snap. If the backup came from another server, also compare deploy/.env with the backed-up copy (restic restore … --include /backup/env)."
