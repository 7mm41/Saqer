#!/bin/bash
# Shows the control panel's private address. It is printed nowhere else, so if you
# forget it, run this on the server:
#   bash deploy/panel-link.sh          show it
#   bash deploy/panel-link.sh --new    make a new one (the old address stops working at once)
#                                      and restart the server: use it if the link leaked
set -euo pipefail
cd "$(dirname "$0")/.."

env=backend/.env
[ -f "$env" ] || { echo "backend/.env doesn't exist yet: run  sudo bash deploy/install.sh  first."; exit 1; }
current() { grep -E "^$1=" "$env" 2>/dev/null | head -n 1 | cut -d= -f2- || true; }
domain=$(grep -E '^SARENA_DOMAIN=' .env 2>/dev/null | head -n 1 | cut -d= -f2- || true)
domain=${domain:-sarena.tech}

if [ "${1:-}" = "--new" ]; then
  new=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom 2>/dev/null | head -c 24 || true)
  [ "${#new}" -eq 24 ] || { echo "Couldn't make a new address. Nothing changed."; exit 1; }
  if grep -qE '^ADMIN_PATH=' "$env"; then sed -i "s|^ADMIN_PATH=.*|ADMIN_PATH=$new|" "$env"; else printf 'ADMIN_PATH=%s\n' "$new" >>"$env"; fi
  chmod 600 "$env"
  echo "Restarting the server with the new address…"
  docker compose up -d --force-recreate app >/dev/null
  for _ in $(seq 1 60); do
    docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1 && break
    sleep 2
  done
fi

path=$(current ADMIN_PATH)
if [ -z "$path" ]; then
  # Not written in .env: the server derives it from JWT_SECRET. Ask the running server.
  path=$(docker compose exec -T app node -e "import('./src/config.ts').then((m) => console.log(m.loadConfig().panelPath))" 2>/dev/null | tr -d '\r' || true)
fi
[ -n "$path" ] || { echo "Couldn't read the address. Is Sarena running? (cd $(pwd) && docker compose ps)"; exit 1; }

cat <<LINK

  Control panel:  https://$domain/$path/

  Private: don't share it or post it anywhere.
  Save it as a bookmark, and sign in there with saqer@sarena.tech.
LINK
