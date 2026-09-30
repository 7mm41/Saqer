#!/bin/bash
# Connects Sarena to Apple's push service (APNs), so notifications reach phones.
#   bash deploy/push-setup.sh
# It asks for the three things from developer.apple.com (Key ID, Team ID and the key
# file), puts them in backend/.env, keeps the key in backend/certs/, and restarts the
# server. The key is pasted hidden and is never shown, printed or sent anywhere.
# Run it again any time to change them.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }
current() { grep -E "^$2=" "$1" 2>/dev/null | head -n 1 | cut -d= -f2- || true; }
replace() {
  local file=$1 key=$2 value=$3
  if grep -qE "^${key}=" "$file"; then sed -i "s|^${key}=.*|${key}=${value}|" "$file"; else printf '%s=%s\n' "$key" "$value" >>"$file"; fi
}

env=backend/.env
[ -f "$env" ] || { echo "backend/.env doesn't exist yet: run  sudo bash deploy/install.sh  first."; exit 1; }
command -v openssl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq openssl >/dev/null; }

ask_id() { # label, current value, what it is
  local label=$1 value=$2 hint=$3 answer
  while true; do
    if [ -n "$value" ]; then read -rp "  $label [$value]: " answer; answer=${answer:-$value}; else read -rp "  $label: " answer; fi
    answer=$(printf '%s' "$answer" | tr -d '[:space:]' | tr 'a-z' 'A-Z')
    if [[ $answer =~ ^[A-Z0-9]{10}$ ]]; then printf '%s' "$answer"; return; fi
    echo "  It has exactly 10 letters and digits ($hint). Try again." >&2
  done
}

say "Apple push notifications (APNs)"
echo "  Get these from developer.apple.com (Account › Keys › + › Apple Push Notifications service):"
key_id=$(ask_id "Key ID (shown next to the key)" "$(current "$env" APNS_KEY_ID)" "e.g. ABC123DEFG")
team_id=$(ask_id "Team ID (Account › Membership details)" "$(current "$env" APNS_TEAM_ID)" "e.g. 1A2B3C4D5E")

certs=backend/certs
mkdir -p "$certs"
target="$certs/AuthKey_$key_id.p8"
existing=$(current "$env" APNS_KEY_FILE)
keep=false
if [ -n "$existing" ] && [ -f "backend/$existing" ]; then
  read -rp "  Keep the key file already in use ($existing)? [Y/n] " answer
  [[ ! $answer =~ ^[Nn] ]] && keep=true
fi

if $keep; then
  target="backend/$existing"
else
  echo "  Paste the whole text of the AuthKey_….p8 file (from -----BEGIN to -----END),"
  echo "  then press Enter and Ctrl+D. Nothing shows while you paste."
  if [ -t 0 ]; then stty -echo; trap 'stty echo' EXIT; fi
  pasted=$(cat)
  if [ -t 0 ]; then stty echo; trap - EXIT; echo; fi
  umask 077
  printf '%s\n' "$pasted" >"$target.new"
  unset pasted
  if ! openssl pkey -in "$target.new" -noout >/dev/null 2>&1; then
    rm -f "$target.new"
    echo "That isn't a valid .p8 key (copy the whole file, including the BEGIN and END lines). Nothing changed."
    exit 1
  fi
  mv "$target.new" "$target"
fi

# The server runs as an unprivileged user inside its container: let it (only) read the key.
uid=$(docker compose exec -T app id -u 2>/dev/null | tr -d '\r' || true)
chown "${uid:-1000}:${uid:-1000}" "$target" 2>/dev/null || true
chmod 600 "$target"

sed -i '/^APNS_KEY=/d' "$env"
replace "$env" APNS_KEY_ID "$key_id"
replace "$env" APNS_TEAM_ID "$team_id"
replace "$env" APNS_KEY_FILE "${target#backend/}"
chmod 600 "$env"

say "Restarting the server…"
docker compose up -d --force-recreate app >/dev/null
healthy() {
  docker compose exec -T app node -e \
    "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1
}
for _ in $(seq 1 60); do healthy && break; sleep 2; done
if ! healthy; then
  echo "The server didn't start. Its log:"
  docker compose logs --tail 40 app
  exit 1
fi

if docker compose logs --tail 40 app 2>&1 | grep -q "Push notifications are off"; then
  echo "Apple's settings were saved, but the server says push is still off:"
  docker compose logs --tail 40 app 2>&1 | grep "Push notifications are off"
  exit 1
fi

cat <<DONE

────────────────────────────────────────────────────────────
  Push notifications are connected.

  Test it: open the control panel › Notifications › "Send a test
  to my phone". The app must be installed on the phone (from
  Xcode or TestFlight), signed in, with notifications allowed.
────────────────────────────────────────────────────────────
DONE
