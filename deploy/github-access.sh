#!/bin/bash
# Lets this server download Sarena's updates from GitHub, even when the repository is
# private, with a read-only "deploy key" made here (it can only read this repository).
#   bash deploy/github-access.sh
# The first time it prints the key to add on GitHub; run it again afterwards to check.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v ssh-keygen >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq openssh-client >/dev/null; }
key=/root/.ssh/sarena_deploy
mkdir -p /root/.ssh
chmod 700 /root/.ssh
[ -f "$key" ] || ssh-keygen -q -t ed25519 -N "" -C "sarena-server-$(hostname)" -f "$key"

repo=$(git remote get-url origin | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')
git config core.sshCommand "ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

if git ls-remote "git@github.com:$repo.git" >/dev/null 2>&1; then
  git remote set-url origin "git@github.com:$repo.git"
  echo "GitHub access works: updates come from github.com/$repo with this server's read-only key."
  exit 0
fi

cat <<KEY

Add this server's key on GitHub (read only):
  1. Open https://github.com/$repo/settings/keys/new
  2. Title: sarena.tech server
  3. Key: the line below, starting with ssh-ed25519
  4. Leave "Allow write access" OFF, then "Add key"

$(cat "$key.pub")

Then run this again:  bash deploy/github-access.sh
KEY
exit 2
