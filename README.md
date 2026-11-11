# pi-config

My personal [pi](https://github.com/earendil-works/pi) configuration: extensions, skills, keybindings and settings.

## Credits

This config is **based on [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config)** by Amos Blomqvist, from his videos [My Pi Setup After 6 Months](https://www.youtube.com/@EeroAlvar) and [Pi Coding Agent Setup After 2 Months](https://www.youtube.com/watch?v=DWWrLlM3gwQ). Most of the extensions and skills here originate from his repo, and I'm grateful for his work. Some of them I have modified. Please see the original for the up-to-date versions, and star it.

| Item | Origin |
| --- | --- |
| `extensions/ask-user-question.ts`, `bash-guard/`, `browser/`, `custom-header.ts`, `prompt-snippets/`, `web-fetch/`, `web-search/` | [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config) (some modified by me) |
| `skills/analyze-sessions`, `pdf-reader`, `web-debug`, `youtube-transcript` | [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config) |
| `extensions/minimal-footer.ts`, `session-status/` | my own |

The upstream repository has no license file at the time of writing, so all rights to the upstream parts remain with their author.

## Install

Full Ubuntu walkthrough (Node 22, pi, Chromium, secrets): see [INSTALL.md](INSTALL.md). Short version:

```bash
git clone git@github.com:sciphilib/pi-config.git ~/pi-config
~/pi-config/install.sh
```

The script symlinks the config into `~/.pi/agent` (existing files are backed up as `*.bak.<timestamp>`) and runs `npm ci` for extensions that have a `package.json`.

## Contents

- `agent/extensions` — ask-user-question, bash-guard, browser, custom-header, minimal-footer, prompt-snippets, session-status, web-fetch, web-search
- `agent/skills` — analyze-sessions, pdf-reader, web-debug, youtube-transcript
- `agent/keybindings.json`, `agent/settings.json`
