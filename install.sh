#!/usr/bin/env bash
# Set up this pi config: symlink into ~/.pi/agent and install dependencies.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.pi/agent"

command -v node >/dev/null || { echo "Node.js not found. See INSTALL.md" >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js $(node -v) is too old, pi needs 22.19+. See INSTALL.md" >&2; exit 1
fi
mkdir -p "$DEST"

for item in extensions skills tests keybindings.json settings.json; do
  target="$DEST/$item"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    mv "$target" "$target.bak.$(date +%s)"; echo "backup: $target"
  fi
  ln -sfn "$REPO/agent/$item" "$target"; echo "link: $item"
done

for d in "$REPO"/agent/extensions/*/; do
  [ -f "$d/package.json" ] && (cd "$d" && echo "npm ci: $d" && npm ci --no-audit --no-fund)
done

# pdf-reader expects a venv at skills/pdf-reader/.venv
PDF="$REPO/agent/skills/pdf-reader"
if command -v python3 >/dev/null && python3 -m venv "$PDF/.venv" 2>/dev/null; then
  "$PDF/.venv/bin/pip" install -q -r "$PDF/requirements.txt"
else
  echo "WARNING: could not create venv for pdf-reader (sudo apt install python3-venv), skipping" >&2
fi

cat <<M

Done. Remaining manual steps (secrets are never stored in this repo):
  1. Start pi and run /login (creates ~/.pi/agent/auth.json)
  2. web-search: copy extensions/web-search/auth.example.json to auth.json and fill in your keys
  3. browser: run 'npx playwright install chromium' in extensions/browser
M
