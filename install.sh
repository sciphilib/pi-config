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

# web-search uses a local SearXNG in ~/.pi/agent/searxng (started on demand by the extension)
setup_searxng() {
  local sx="$DEST/searxng" py="" c
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
      py="$c"; break
    fi
  done
  [ -n "$py" ] || { echo "Python 3.10+ not found" >&2; return 1; }
  command -v git >/dev/null || { echo "git not found" >&2; return 1; }
  command -v lsof >/dev/null || echo "WARNING: lsof not found, web-search cannot stop SearXNG (sudo apt install lsof)" >&2

  mkdir -p "$sx" || return 1
  if [ -d "$sx/src/.git" ]; then
    echo "searxng: git pull"; git -C "$sx/src" pull -q --ff-only || return 1
  else
    echo "searxng: clone"; git clone -q --depth 1 https://github.com/searxng/searxng "$sx/src" || return 1
  fi
  [ -x "$sx/venv/bin/python" ] || "$py" -m venv "$sx/venv" || return 1
  echo "searxng: pip install ($("$sx/venv/bin/python" --version))"
  "$sx/venv/bin/pip" install -q -U pip setuptools wheel pyyaml msgspec typing-extensions pybind11 || return 1
  (cd "$sx/src" && "$sx/venv/bin/pip" install -q --use-pep517 --no-build-isolation -e .) || return 1

  if [ ! -f "$sx/settings.yml" ]; then
    local secret
    secret="$("$sx/venv/bin/python" -c 'import secrets; print(secrets.token_hex(32))')" || return 1
    cat > "$sx/settings.yml" <<YML || return 1
use_default_settings: true

general:
  debug: false
  instance_name: "pi-searxng"

search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json

server:
  bind_address: "127.0.0.1"
  port: 8899
  secret_key: "$secret"
  limiter: false
  image_proxy: false
  public_instance: false
YML
    chmod 600 "$sx/settings.yml"
    echo "searxng: created settings.yml"
  fi
}
setup_searxng || echo "WARNING: SearXNG setup failed, web_search will not work. See agent/extensions/web-search/README.md" >&2

cat <<M

Done. Remaining manual steps (secrets are never stored in this repo):
  1. Start pi and run /login (creates ~/.pi/agent/auth.json)
  2. browser: run 'npx playwright install chromium' in extensions/browser
M
