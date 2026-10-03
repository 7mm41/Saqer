#!/usr/bin/env bash
# Prints the admin panel address. Run on the server only.
. "$(dirname "$0")/lib.sh"
load_env
echo "https://$DOMAIN/$ADMIN_PATH/"
