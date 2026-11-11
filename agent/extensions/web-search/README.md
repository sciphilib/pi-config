# web-search

Web search for pi through a local [SearXNG](https://github.com/searxng/searxng). No API keys and no Docker.

SearXNG is not running all the time. The extension starts it on the first search and stops it after 10 minutes without searches, or when you quit pi. If pi crashes and leaves it running, it gets stopped the next time pi starts.

## Install

`install.sh` sets it up in `~/.pi/agent/searxng`. To do it by hand:

```bash
SX=~/.pi/agent/searxng
git clone --depth 1 https://github.com/searxng/searxng $SX/src
python3 -m venv $SX/venv
$SX/venv/bin/pip install -U pip setuptools wheel pyyaml msgspec typing-extensions pybind11
cd $SX/src && $SX/venv/bin/pip install --use-pep517 --no-build-isolation -e .
```

You need Python 3.10 or newer, and `lsof`.

Then create `$SX/settings.yml`:

```yaml
use_default_settings: true
search:
  formats: [html, json]
server:
  bind_address: "127.0.0.1"
  port: 8899
  secret_key: "put the output of `openssl rand -hex 32` here"
  limiter: false
  image_proxy: false
```

Don't forget `json` in `formats`, the extension needs it.

## Settings

- `SEARXNG_IDLE_MINUTES`: how long to wait before stopping, 10 by default.
- `SEARXNG_PORT`: 8899 by default. Change it in `settings.yml` too.

## Update

Run `install.sh` again, or:

```bash
git -C ~/.pi/agent/searxng/src pull
```

The log is in `~/.pi/agent/searxng/searxng.log`.
