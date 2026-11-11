# pi-config

My config for [pi](https://github.com/earendil-works/pi): extensions, skills, keybindings and settings.

## Credits

Most of this comes from [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config) by Amos Blomqvist. He talks about it in [My Pi Setup After 6 Months](https://www.youtube.com/@EeroAlvar) and [Pi Coding Agent Setup After 2 Months](https://www.youtube.com/watch?v=DWWrLlM3gwQ). Thanks, Amos! Check out his repo for the latest versions.

From his repo, some of them changed by me:

- extensions: `ask-user-question.ts`, `bash-guard`, `browser`, `custom-header.ts`, `prompt-snippets`, `web-fetch`, `web-search`
- skills: `analyze-sessions`, `pdf-reader`, `web-debug`, `youtube-transcript`

Mine: `minimal-footer.ts`, `session-status`.

His repo has no license yet, so the rights to his parts stay with him.

## Install

```bash
git clone git@github.com:sciphilib/pi-config.git ~/pi-config
~/pi-config/install.sh
```

The script links everything into `~/.pi/agent`, installs the npm dependencies and sets up SearXNG for web search. Old files are kept as `*.bak.<timestamp>`.

Setting up a fresh Ubuntu machine from scratch: [INSTALL.md](INSTALL.md).
