#!/bin/bash
# Finds out why Sarena isn't answering, and says what to do. It only reads, unless asked:
#   bash deploy/doctor.sh          check everything
#   bash deploy/doctor.sh --fix    also do the safe repairs: start stopped containers, open ports 80/443 in ufw
# Nothing it prints contains a password, a key or the control panel's address.
set -uo pipefail
cd "$(dirname "$0")/.."

fix=false
[ "${1:-}" = "--fix" ] && fix=true
problems=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; problems=$((problems + 1)); }
note() { printf '      %s\n' "$1"; }
head_() { printf '\n\033[1;33m%s\033[0m\n' "$1"; }

domain=$(grep -E '^SARENA_DOMAIN=' .env 2>/dev/null | head -n 1 | cut -d= -f2-)
domain=${domain:-sarena.tech}

head_ "1. The machine"
avail=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')
swap=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}')
if [ -n "$avail" ] && [ "$avail" -lt 150 ]; then
  bad "Almost no free memory (${avail} MB). The build can be killed."
  [ "${swap:-0}" -eq 0 ] && note "No swap: fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
else
  ok "Memory: ${avail:-?} MB free, swap ${swap:-0} MB"
fi
used=$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')
if [ -n "$used" ] && [ "$used" -ge 92 ]; then
  bad "The disk is ${used}% full. Free space: docker system prune -af (keeps the database)."
else
  ok "Disk: ${used:-?}% used"
fi
if dmesg 2>/dev/null | grep -qi 'out of memory'; then
  note "The system killed programs for lack of memory at some point (dmesg | grep -i 'out of memory')."
fi

head_ "2. Docker and Sarena's three parts"
if ! command -v docker >/dev/null 2>&1; then
  bad "Docker isn't installed: run  sudo bash deploy/install.sh --domain $domain"
else
  if docker info >/dev/null 2>&1; then ok "Docker is running"; else
    bad "Docker isn't running."
    if $fix; then systemctl start docker && ok "Started Docker"; else note "Start it: systemctl start docker   (or run this again with --fix)"; fi
  fi
  stopped=false
  for service in db app caddy; do
    state=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$service" '$1 == s {print $2}')
    if [ "$state" = "running" ]; then ok "$service is running"; else bad "$service is ${state:-missing}"; stopped=true; fi
  done
  if $stopped; then
    if $fix; then
      echo "      Starting them…"; docker compose up -d >/dev/null 2>&1 && ok "Started: docker compose up -d" || bad "Couldn't start them: docker compose logs --tail 40"
    else
      note "Start them: cd $(pwd) && docker compose up -d   (or run this again with --fix)"
    fi
  fi
fi

head_ "3. Does the server answer?"
if command -v docker >/dev/null 2>&1; then
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1; then
    ok "The app answers inside its container"
  else
    bad "The app doesn't answer. Its log:"
    docker compose logs --tail 25 app 2>&1 | sed 's/^/      /'
  fi
fi
answer=$(curl -sk -m 10 --resolve "$domain:443:127.0.0.1" "https://$domain/health" 2>/dev/null)
if [ "$answer" = '{"ok":true}' ]; then ok "https://$domain/health answers on this machine"; else bad "https://$domain/health doesn't answer on this machine (got: ${answer:-nothing})"; fi

head_ "4. Ports 80 and 443 (what the world connects to)"
for port in 80 443; do
  who=$(ss -ltnpH "( sport = :$port )" 2>/dev/null | head -n 1)
  if [ -z "$who" ]; then bad "Nothing is listening on port $port"
  elif echo "$who" | grep -q 'docker-proxy\|caddy'; then ok "Port $port: Sarena's Caddy"
  else bad "Port $port is taken by another program:"; note "$(echo "$who" | sed -E 's/\s+/ /g' | cut -c1-110)"; fi
done
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  if ufw status | grep -qE '^(80|443)(/tcp)? +ALLOW'; then ok "The server firewall (ufw) allows 80 and 443"; else
    bad "The server firewall (ufw) blocks ports 80/443."
    if $fix; then ufw allow 80/tcp >/dev/null && ufw allow 443 >/dev/null && ok "Opened 80 and 443 in ufw"; else note "Open them: ufw allow 80/tcp && ufw allow 443   (or run this again with --fix)"; fi
  fi
else
  ok "No server firewall (ufw) in the way"
fi

head_ "5. The domain"
dns=$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR==1 {print $1}')
ip=$(curl -fsS4 -m 6 https://api.ipify.org 2>/dev/null)
if [ -z "$dns" ]; then bad "$domain has no address yet: set its DNS A record to ${ip:-the IP of this server}."
elif [ -n "$ip" ] && [ "$dns" != "$ip" ]; then bad "$domain points to $dns, but this server is $ip. Fix the DNS A record (@ and www)."
else ok "$domain → ${dns} (this server)"; fi

head_ "6. The HTTPS certificate"
if command -v docker >/dev/null 2>&1; then
  tls=$(docker compose logs --tail 300 caddy 2>&1 | grep -iE 'error|rate limit|challenge|no valid a records|unauthorized' | tail -n 4)
  if [ -n "$tls" ]; then note "Caddy reported (may be old):"; echo "$tls" | cut -c1-200 | sed 's/^/      /'; else ok "Caddy reports no certificate problems"; fi
fi

head_ "7. Updates"
if [ -f /var/log/sarena-update.log ]; then tail -n 3 /var/log/sarena-update.log | sed 's/^/      /'; else note "(no automatic updates yet)"; fi

echo
if [ "$problems" -eq 0 ]; then
  printf '\033[1;32mEverything looks right on this machine.\033[0m\n'
  echo "If https://$domain/health still doesn't open from your phone or computer, the block is outside this machine:"
  echo "  • hPanel › VPS › the server must say Running;"
  echo "  • hPanel › VPS › Security › Firewall: TCP 80 and 443 must be allowed (or no firewall attached)."
else
  printf '\033[1;31m%s problem(s) found above.\033[0m' "$problems"
  $fix || printf '  Run  bash deploy/doctor.sh --fix  to apply the safe repairs.'
  echo
fi
