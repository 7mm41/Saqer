#!/bin/bash
# Puts Sarena online on a new Ubuntu/Debian server (e.g. a Hostinger VPS), with HTTPS:
# the website at https://<domain>/, the control panel at /admin/ and the app's API.
#
#   1. Point the domain's DNS "A" record (@, and www) at this server's IP.
#   2. Copy this folder to the server, then inside it run:  sudo bash deploy/install.sh
#
# Safe to run again: existing settings, passwords and data are kept. To update
# later, replace the folder's files (or `git pull`) and run it again.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(id -u)" -ne 0 ]; then
  echo "Run it as root: sudo bash deploy/install.sh"
  exit 1
fi

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }
# Letters and digits without look-alikes (0/O, 1/l/I). `|| true`: head closing the pipe isn't an error.
random() { LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom 2>/dev/null | head -c "$1" || true; }

# KEY=value in an env file: fills an empty or missing key, never overwrites a value already set.
ensure() {
  local file=$1 key=$2 value=$3
  if grep -qE "^${key}=.+" "$file"; then return; fi
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}
current() { grep -E "^$2=" "$1" 2>/dev/null | head -n 1 | cut -d= -f2- || true; }

# 1. Docker
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi

# 2. The domain
touch .env
domain=$(current .env SARENA_DOMAIN)
if [ -z "$domain" ]; then
  read -rp "Your domain (e.g. sarena.fun): " domain
  domain=$(echo "$domain" | sed -E 's#^https?://##; s#/.*$##; s#^www\.##' | tr 'A-Z' 'a-z')
  [ -n "$domain" ] || { echo "A domain is needed."; exit 1; }
fi
ensure .env SARENA_DOMAIN "$domain"
ensure .env POSTGRES_PASSWORD "$(random 32)"

# 3. Server settings (backend/.env), kept if already filled in
mkdir -p backend/certs
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
fi
new_password=""
if [ -z "$(current backend/.env ADMIN_PASSWORD)" ]; then
  new_password=$(random 12)
fi
ensure backend/.env JWT_SECRET "$(random 48)"
ensure backend/.env PUBLIC_URL "https://$domain"
ensure backend/.env ADMIN_EMAIL "admin@$domain"
[ -n "$new_password" ] && ensure backend/.env ADMIN_PASSWORD "$new_password"
chmod 600 .env backend/.env

# 4. Is the domain pointing here yet? (HTTPS works once it does; Caddy keeps retrying.)
ip=$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
dns=$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR==1 {print $1}' || true)
if [ -n "$ip" ] && [ "$dns" != "$ip" ]; then
  say "Note: $domain points to ${dns:-nowhere yet}, not to this server ($ip)."
  echo "  Set its DNS A record (@ and www) to $ip. HTTPS starts by itself once it does (up to a few hours)."
fi

# 5. Firewall: web and SSH only
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443 >/dev/null
fi

# 6. Ports 80 and 443 must be free for HTTPS (some server images come with Apache or nginx running)
busy=$(ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v docker-proxy || true)
if [ -n "$busy" ]; then
  echo "Ports 80/443 are already used by another program:"
  echo "$busy"
  echo "Stop it first, e.g.:  systemctl disable --now apache2 nginx   (then run this again)"
  exit 1
fi

# 7. Build and start (the database is created on the first start)
say "Building and starting Sarena (the first time takes a few minutes)…"
docker compose up -d --build

for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1 && break
  sleep 2
done
if ! curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
  echo "The server didn't start. Its log:"
  docker compose logs --tail 60 app
  exit 1
fi

admin_email=$(current backend/.env ADMIN_EMAIL)
cat <<DONE

────────────────────────────────────────────────────────────
  Sarena is running.

  Website        https://$domain/
  Control panel  https://$domain/admin/
  Admin email    $admin_email
  Password       ${new_password:-(unchanged: ADMIN_PASSWORD in backend/.env)}

  Connect the iPhone app: open the control panel on the phone and
  tap "Connect the app". App Store builds: set SarenaAPIBaseURL to
  https://$domain in the app's Info.plist.

  Push notifications: put the AuthKey_XXXXXXXXXX.p8 file in
  backend/certs/, fill APNS_* in backend/.env, then run this again.

  Logs:    docker compose logs -f app
  Update:  replace the files (or git pull), then run this again.
────────────────────────────────────────────────────────────
DONE
