#!/usr/bin/env bash
# One-command install on a fresh Ubuntu/Debian server with Docker:
#   git clone … /opt/katf && sudo /opt/katf/deploy/install.sh
# Creates deploy/.env and deploy/backup.env with random secrets, builds and starts the stack,
# creates the owner account (password typed by you, never stored here) and schedules nightly backups.
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"

command -v docker >/dev/null || die "Docker is not installed. See https://docs.docker.com/engine/install/"
docker compose version >/dev/null || die "Docker Compose v2 is required"
command -v openssl >/dev/null || die "openssl is required"
[[ $EUID -eq 0 ]] || warn "not running as root: the backup cron job will not be installed"

if [[ ! -f "$ENV_FILE" ]]; then
  say "Creating deploy/.env"
  install -m 600 "$DEPLOY_DIR/.env.example" "$ENV_FILE"
  read -rp "Domain name (e.g. katf.om): " domain
  read -rp "Email for HTTPS certificates: " acme
  [[ -n "$domain" && -n "$acme" ]] || die "domain and email are required"
  set_env DOMAIN "$domain"
  set_env ACME_EMAIL "$acme"
  set_env VAPID_SUBJECT "mailto:$acme"
  set_env POSTGRES_PASSWORD "$(rand_hex 24)"
  set_env DATA_KEY "$(rand_hex 32)"
  set_env ADMIN_PATH "$(rand_path 32)"
else
  say "deploy/.env exists — keeping it"
fi
if [[ ! -f "$BACKUP_ENV" ]]; then
  install -m 600 "$DEPLOY_DIR/backup.env.example" "$BACKUP_ENV"
  tmp="$(mktemp)"; awk -v v="$(rand_hex 32)" 'BEGIN{FS=OFS="="} $1=="RESTIC_PASSWORD"{print $1"="v; next} {print}' "$BACKUP_ENV" >"$tmp"
  cat "$tmp" >"$BACKUP_ENV"; rm -f "$tmp"; chmod 600 "$BACKUP_ENV"
fi
load_env

say "Building images (first build takes a few minutes)"
"${COMPOSE[@]}" build

if [[ -z "${VAPID_PRIVATE_KEY:-}" ]]; then
  say "Generating web-push keys"
  keys="$("${COMPOSE[@]}" run --rm --no-deps -T api node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")"
  set_env VAPID_PUBLIC_KEY "${keys%% *}"
  set_env VAPID_PRIVATE_KEY "${keys##* }"
  load_env
fi

say "Starting the stack"
"${COMPOSE[@]}" up -d
wait_healthy api 240 || die "the API did not become healthy — check: docker compose -f deploy/docker-compose.yml logs api"

say "Create the owner account (you will type the password; it is never shown or saved in a file)"
"${COMPOSE[@]}" exec api node dist/cli.js create-owner

if [[ $EUID -eq 0 ]]; then
  say "Scheduling nightly backups (02:15) and a weekly restore test (Fridays 04:30)"
  cat >/etc/cron.d/katf <<CRON
SHELL=/bin/bash
15 2 * * * root $DEPLOY_DIR/backup.sh >>/var/log/katf-backup.log 2>&1
30 4 * * 5 root $DEPLOY_DIR/restore.sh --test >>/var/log/katf-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/katf
fi

say "Done."
echo
echo "  Website:         https://$DOMAIN"
echo "  Technician app:  https://$DOMAIN/tech"
echo "  Admin panel:     https://$DOMAIN/$ADMIN_PATH/   (keep this address private)"
echo
warn "Save a copy of deploy/.env and deploy/backup.env in your password manager now."
warn "Without DATA_KEY and RESTIC_PASSWORD a backup cannot be restored."
warn "Live payments, public registration and SMS to the public stay off until the legal gate is cleared in Settings."
