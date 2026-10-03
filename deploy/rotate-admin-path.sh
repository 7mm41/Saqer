#!/usr/bin/env bash
# Gives the admin panel a new secret address. Everyone signed in to the admin panel must sign in again.
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
load_env
new="$(rand_path 32)"
set_env ADMIN_PATH "$new"
"${COMPOSE[@]}" up -d --no-build api caddy
wait_healthy api 180 || die "API not healthy — check the logs"
say "New admin address: https://$DOMAIN/$new/"
warn "The old address now returns 404. Share the new one only with staff, in person or by a private channel."
