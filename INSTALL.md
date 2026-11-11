# Installing on Ubuntu

For a fresh Ubuntu 22.04 or 24.04.

## 1. Packages

```bash
sudo apt update
sudo apt install -y git curl ca-certificates python3 python3-venv python3-pip ffmpeg lsof
```

## 2. Node.js

pi needs Node 22.19 or newer. The one from apt is too old, so use nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
node -v
```

## 3. pi

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Open a new terminal and check that `pi --version` works.

## 4. This config

```bash
git clone https://github.com/sciphilib/pi-config.git ~/pi-config
~/pi-config/install.sh
```

The script links the config into `~/.pi/agent`, installs the npm dependencies, makes a venv for `pdf-reader` and sets up SearXNG for web search (see [its README](agent/extensions/web-search/README.md)).

The config is linked, not copied, so to update it later just `git pull` and run `/reload` in pi.

## 5. Browser

```bash
cd ~/pi-config/agent/extensions/browser
npx playwright install chromium
sudo npx playwright install-deps chromium
```

Turn it on in pi with `/browser on`.

## 6. yt-dlp

Needed for `youtube-transcript`. The apt version is usually too old:

```bash
sudo apt install -y pipx && pipx ensurepath
pipx install yt-dlp
```

## 7. Log in

Start `pi` in some project folder and run `/login`.
