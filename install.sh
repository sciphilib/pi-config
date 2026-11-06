#!/usr/bin/env bash
# Set up this pi config: symlink into ~/.pi/agent and install dependencies.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.pi/agent"
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

[ -f "$REPO/agent/skills/pdf-reader/requirements.txt" ] && \
  python3 -m pip install -r "$REPO/agent/skills/pdf-reader/requirements.txt" || true

cat <<M

Done. Remaining manual steps (secrets are never stored in this repo):
  1. Start pi and run /login (creates ~/.pi/agent/auth.json)
  2. web-search: copy extensions/web-search/auth.example.json to auth.json and fill in your keys
  3. browser: run 'npx playwright install chromium' in extensions/browser
M
