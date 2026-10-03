# Shared helpers for the deploy scripts. Sourced, not executed.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.yml" --env-file "$ENV_FILE")

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# Reads KEY=VALUE lines without executing them (values may contain spaces, < > and $).
read_env_file() {
  local line k v
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    k="${line%%=*}"; v="${line#*=}"
    if [[ "$v" =~ ^\"(.*)\"$ || "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
    export "$k=$v"
  done <"$1"
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "deploy/.env not found — run deploy/install.sh first"
  read_env_file "$ENV_FILE"
}

rand_hex() { openssl rand -hex "${1:-32}"; }
rand_path() { openssl rand -base64 96 | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c "1-${1:-32}"; }

set_env() { # set_env KEY VALUE — replace or append, keeping the file private
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' "$ENV_FILE" >"$tmp"
    cat "$tmp" >"$ENV_FILE"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$k" "$v" >>"$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  export "$k=$v" # shell variables override --env-file in compose, so keep them in step
}

wait_healthy() { # wait_healthy SERVICE [seconds]
  local svc="$1" t="${2:-180}" id state
  for ((i = 0; i < t; i += 3)); do
    id="$("${COMPOSE[@]}" ps -q "$svc" 2>/dev/null || true)"
    if [[ -n "$id" ]]; then
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      [[ "$state" == "healthy" || "$state" == "running" && "$svc" == "caddy" ]] && return 0
    fi
    sleep 3
  done
  return 1
}

volume_path() { docker volume inspect -f '{{.Mountpoint}}' "katf_$1"; }

BACKUP_ENV="$DEPLOY_DIR/backup.env"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.18.1}"

load_backup_env() {
  [[ -f "$BACKUP_ENV" ]] || die "deploy/backup.env not found — run deploy/install.sh first"
  read_env_file "$BACKUP_ENV"
  [[ -n "${RESTIC_PASSWORD:-}" ]] || die "RESTIC_PASSWORD is empty in deploy/backup.env"
}

# restic in a container, so the host needs nothing but Docker. Extra docker args go before "--".
restic_run() {
  local docker_args=() repo="$RESTIC_REPOSITORY"
  while [[ $# -gt 0 && "$1" != "--" ]]; do docker_args+=("$1"); shift; done
  [[ "${1:-}" == "--" ]] && shift
  if [[ "$repo" == /* ]]; then
    mkdir -p "$repo"; chmod 700 "$repo"
    docker_args+=(-v "$repo:/repo"); repo=/repo
  fi
  docker run --rm "${docker_args[@]}" \
    -e RESTIC_REPOSITORY="$repo" -e RESTIC_PASSWORD \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
    -e RESTIC_CACHE_DIR=/tmp/restic-cache \
    "$RESTIC_IMAGE" "$@"
}
