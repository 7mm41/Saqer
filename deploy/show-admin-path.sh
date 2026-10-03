#!/usr/bin/env bash
# Prints the admin panel address. Run on the server only.
# shellcheck source=deploy/lib.sh
. "$(dirname "$0")/lib.sh"
load_env
echo "https://$DOMAIN/$ADMIN_PATH/"
