#!/bin/bash
# Sets a new control panel password and prints the sign-in details.
#   bash admin-password.sh                  a new password
#   bash admin-password.sh MyPassword2026   your own (8+ characters, letters and numbers)
# Stop the server first. Works even when this Terminal can't find `node` or `npm`.
cd "$(dirname "$0")/backend" || exit 1

# Node 22.18 or newer runs the server's TypeScript files directly.
usable() {
  "$1" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' 2>/dev/null
}

# On the PATH, or from Homebrew, the nodejs.org installer, Volta, nvm or fnm…
node_bin=""
for candidate in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.volta/bin/node \
  "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.fnm/aliases/default/bin/node; do
  if [ -n "$candidate" ] && [ -x "$candidate" ] && usable "$candidate"; then node_bin=$candidate; break; fi
done
# …or a copy of Node somewhere in the home folder.
if [ -z "$node_bin" ]; then
  while IFS= read -r candidate; do
    if usable "$candidate"; then node_bin=$candidate; break; fi
  done < <(find "$HOME" -maxdepth 6 \( -name Library -o -name node_modules -o -name .Trash \) -prune \
    -o -path '*/bin/node' \( -type f -o -type l \) -perm -u+x -print 2>/dev/null)
fi
if [ -z "$node_bin" ]; then
  echo "Node.js 22.18 or newer wasn't found. Install it from https://nodejs.org, then run this again."
  exit 1
fi

exec "$node_bin" --env-file-if-exists=.env scripts/admin-password.ts "$@"
