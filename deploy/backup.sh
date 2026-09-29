#!/bin/bash
# An encrypted copy of Sarena's database: backups/sarena-<date>.sql.gz.enc, encrypted
# with AES-256 using the key in backups/.key (made by the installer, readable by root
# only). The last 14 are kept. The installer runs this every night at 03:17.
#
# Personal data inside is also encrypted by the app, and passwords are only stored as
# hashes. To keep a copy off the server, download a backup file AND backups/.key
# (separately, somewhere safe): without the key the file can't be opened.
#
# Restore a backup (replaces the current data):
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:backups/.key -in backups/<file> \
#     | gunzip | docker compose exec -T db psql -q -U sarena sarena
set -euo pipefail
cd "$(dirname "$0")/.."

umask 077
mkdir -p backups
chmod 700 backups
if [ ! -s backups/.key ]; then
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 64 >backups/.key || true
fi

file="backups/sarena-$(date +%Y-%m-%d-%H%M).sql.gz.enc"
if ! docker compose exec -T db pg_dump -U sarena --clean --if-exists sarena \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:backups/.key -out "$file"; then
  rm -f "$file"
  echo "The backup failed (is Sarena running? docker compose ps)." >&2
  exit 1
fi
echo "Saved $file"

# Keep the newest 14.
ls -1t backups/sarena-*.sql.gz.enc 2>/dev/null | tail -n +15 | xargs -r rm --
