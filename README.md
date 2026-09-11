# dsh-cool-terminal

![dsh-cool-terminal cover](https://cdn.cooltea.top/dsh-cool-terminal/readme-cover-v0.1.0.png)

English · [中文](./README.zh.md)

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## Description

DeepSeek Harness plugin that adds a **Terminal** tab next to `Chat` and `Trajectory` in every session — a real shell in the session workspace, right beside the conversation.

## Features

- A **Terminal** tab beside `Chat` and `Trajectory`, with a real shell in the session workspace.
- Consoles grouped by your DSH Workspaces, plus a session-bound console when the directory is not one.
- Shell state, scrollback, and per-console command history survive tab switches and page reloads.
- Colors follow the active theme, including `dsh-cool-theme` presets.

## Installation

The easiest way is to let DSH install it for you. For manual installation, see:

```
# Install
dsh plugin --profile <your-profile> add dsh-cool-terminal

# Uninstall
dsh plugin --profile <your-profile> remove dsh-cool-terminal
```

> Replace `<your-profile>` with your DSH profile, e.g. `web` for DSH Web and `desktop` for DSH Desktop.

## Notes

- Consoles run a real local shell as the DSH process user, not the confined one-shot shell — treat them as localhost-trusted.
- A console's geometry is fixed when it is created, because the platform's terminal primitive has no resize verb.
- Consoles are process-local and do not survive a DSH restart; one left without a browser for 15 minutes is closed automatically.
- Commands run in the selected Workspace's directory (or the session directory), and `cd` is remembered within one console, not across consoles.
- Command history lives in `~/.dsh-cool-terminal/history`, keyed by console id. Deleting a console leaves its file behind; remove that directory to clear every console's history at once.
- The PTY provider forces every shell's terminal name to `dumb`, whose terminfo entry cannot move or erase the cursor. A zsh console's startup shim re-exports a real entry (`xterm-256color`, else `xterm`) so line editing, colors, and `clear` behave like a normal xterm; a `.zshrc` that sets `TERM` itself takes precedence.

## Contributing

Contributions via Issues and PRs are welcome.

```
// Clone project
git clone https://github.com/CoolTea001/dsh-cool-terminal.git

// Install dependencies
cd dsh-cool-terminal
pnpm install

// Start local development
pnpm run dev

// Local install
dsh plugin --profile <your-profile> add /absolute/path/to/dsh-cool-terminal

// Restart DSH service
dsh web
```

## License

MIT © CoolTea
