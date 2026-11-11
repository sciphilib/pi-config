# Installing on Ubuntu

Step-by-step guide for a fresh Ubuntu machine (tested against the layout of 22.04 / 24.04).

## 1. Base packages

```bash
sudo apt update
sudo apt install -y git curl ca-certificates python3 python3-venv python3-pip ffmpeg
```

`python3-venv` is needed by the `pdf-reader` skill, `ffmpeg` by `youtube-transcript`.

## 2. Node.js 22.19 or newer

pi requires Node.js **22.19+**. Ubuntu 22.04's apt ships Node 12 (`12.22.9`), which is far too old, and `npm` from apt is old as well. Do **not** rely on `apt install nodejs`. Use nvm, which needs no sudo and doesn't touch the system Node:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# reload the shell so nvm is available
source ~/.bashrc

nvm install 22
nvm alias default 22
node -v    # must print v22.19.0 or newer
npm -v
```

If you previously installed Node from apt, `nvm` takes priority in your `PATH` once loaded. Verify with `which node`: it should point into `~/.nvm/`.

Alternative: NodeSource (system-wide, needs sudo):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 3. Install pi

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Or via npm:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Reopen the terminal (or `source ~/.bashrc`) and check:

```bash
pi --version
```

If `pi: command not found`, make sure the installer's bin directory is in your `PATH` (the installer prints it).

## 4. Get this config

Public repo, so HTTPS works without any credentials:

```bash
git clone https://github.com/sciphilib/pi-config.git ~/pi-config
```

(With an SSH key registered on GitHub you can use `git@github.com:sciphilib/pi-config.git` instead.)

## 5. Apply it

```bash
~/pi-config/install.sh
```

The script:

1. checks that Node is 22+;
2. symlinks `extensions`, `skills`, `tests`, `keybindings.json` and `settings.json` into `~/.pi/agent` (existing files are renamed to `*.bak.<timestamp>`);
3. runs `npm ci` in every extension with a `package.json` (`bash-guard`, `browser`, `web-fetch`);
4. creates `skills/pdf-reader/.venv` and installs PyMuPDF.

Because the files are symlinks, `git pull` in `~/pi-config` updates the live config. Run `/reload` in pi afterwards.

## 6. Browser extension (Chromium)

```bash
cd ~/pi-config/agent/extensions/browser
npx playwright install chromium
sudo npx playwright install-deps chromium   # system libraries for headless Chromium
```

The extension is off by default; enable it in pi with `/browser on`.

## 7. yt-dlp (for the youtube-transcript skill)

The apt version is often outdated and YouTube breaks old releases. Prefer pipx or the official binary:

```bash
sudo apt install -y pipx && pipx ensurepath
pipx install yt-dlp
# or:
# sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp
```

## 8. Secrets (not stored in the repo)

1. Start pi and sign in:
   ```bash
   cd ~/some/project
   pi
   ```
   then run `/login`. This creates `~/.pi/agent/auth.json`.
2. web-search needs Google Custom Search credentials:
   ```bash
   cd ~/pi-config/agent/extensions/web-search
   cp auth.example.json auth.json
   $EDITOR auth.json    # google_search_api_key and google_cse_id
   ```
   `auth.json` is git-ignored.
3. pi asks to trust a project directory the first time you use it there. That state lives in `~/.pi/agent/trust.json` and is per machine.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `node -v` still prints `v12.x` | The shell didn't load nvm. Run `source ~/.bashrc`, or open a new terminal. Check `which node`. |
| `install.sh` says Node is too old | Finish step 2 first. |
| `python3 -m venv` fails | `sudo apt install python3-venv`, then re-run `install.sh`. |
| Chromium fails to start | `sudo npx playwright install-deps chromium`. On a headless server nothing else is needed; the extension is headless by default. |
| `npm ci` fails with EACCES | Don't use `sudo` with npm. Use nvm, as in step 2. |
| Extensions don't show up | Run `/reload` in pi or restart it. Check `ls -la ~/.pi/agent`: the entries should be symlinks into `~/pi-config`. |
