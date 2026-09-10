# dsh-cool-terminal

English · [中文](./README.zh.md)

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## Description

DeepSeek Harness plugin that adds a **Terminal** tab next to `Chat` and `Trajectory` in every session — a real shell in the session workspace, right beside the conversation.

## Features

- A third tab in the conversation view, registered with its own id; the shipped `Chat` and `Trajectory` tabs are untouched.
- A left sidebar listing the same Workspaces as DSH's own sidebar, read live from the Client `workspaces` service — creating, renaming, reordering, or deleting a Workspace shows up without a reload.
- Workspace groups start collapsed and hold no console until you add one; a console runs in its group's directory. The expanded/collapsed state is remembered per browser, and `＋` adds a console and reveals its group.
- A session-bound console appears when the session directory is not a registered Workspace, keeping the original session-`cwd` behavior.
- Every console is a **real PTY** rendered by xterm.js, so it behaves like a system terminal:
  - **Inline input** — typing happens at the shell's own prompt and the shell echoes it, instead of a separate input box.
  - **The shell's own prompt** — including colors, so the current directory is always visible and updates after `cd`.
  - **Ctrl+C** — reaches the foreground process group, interrupting the running command as in a system terminal.
- Shell state persists per console: `cd`, exported variables, and running commands survive switching tabs **and a page reload**. A reloaded page reattaches to the shell it already owned and replays the recent output.
- Every console keeps its **own command history**: ↑ and `history` recall only what that console ran, and nothing typed here reaches your own `~/.zsh_history`. History is written as each command is entered, so a DSH restart (which kills every shell rather than letting it exit) cannot lose it.
- Console names, each console's scrollback (5000 lines), and the last active console are remembered per browser.
- The terminal palette follows the active theme: background, foreground, cursor, selection, and the 16 ANSI colors are resolved from the platform's `--dsw-alias-*` tokens, so light and dark palettes and any theme preset — including `dsh-cool-theme` — apply, and a theme switch repaints every open console in place.

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
