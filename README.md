# dsh-cool-terminal

English · [中文](./README.zh.md)

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## Description

DeepSeek Harness plugin that adds a **Terminal** tab next to `Chat` and `Trajectory` in every session: a real shell in the session workspace, right beside the conversation.

## Features

- A third Conversation View tab, registered into `conversation.view` with its own id — the shipped Chat and Trajectory tabs are untouched.
- A left sidebar listing the same Workspaces as DSH's own sidebar, read live from the Client `workspaces` service: creating, renaming, reordering, or deleting a Workspace shows up here without a reload.
- Workspace groups start collapsed and hold no console until you create one; each console runs in its group's directory. A group's expanded/collapsed state is remembered per browser, and its `＋` adds a console (revealing the group if it was collapsed).
- A session-bound console appears when the session directory is not a registered Workspace, so the tab keeps the original behavior (session `cwd`).
- Every console is a **real PTY** rendered by xterm.js, so it behaves like a system terminal:
  - **Inline input** — typing happens at the shell's own prompt and the shell echoes it; the cursor sits in the output instead of in a separate input box.
  - **The shell's own prompt** — `cooltea@MacBook-Air-2 deepseek-harness %`, including colors, so the current directory is always visible and updates after `cd`.
  - **Ctrl+C** — `⌃C` reaches the foreground process group, interrupting the running command just as in a system terminal.
- No toolbar: the pane is the terminal. The shell's own prompt carries the working directory, so nothing above it duplicates that.
- Shell state persists per console: `cd`, exported variables, and running commands all survive switching tabs, and a browser reload rejoins the same shell (recent output is replayed).
- Console names are persisted per browser, and every console keeps its own scrollback (5000 lines).
- The terminal palette follows the active theme: background, foreground, cursor, selection, and the 16 ANSI colors are resolved from the `--dsw-alias-*` tokens (the same mapping the shipped HTML ANSI renderer uses), so light and dark palettes and any theme preset including `dsh-cool-theme` apply. A theme switch repaints every open console in place.

## Installation

```
# Install
dsh plugin --profile <your-profile> add dsh-cool-terminal

# Uninstall
dsh plugin --profile <your-profile> remove dsh-cool-terminal
```

> Replace `<your-profile>` with your DSH profile, e.g. `web` for DSH Web and `desktop` for DSH Desktop.

## How it works

The package is one bundle with two halves:

- **Host** (`lib/index.js`) registers same-origin routes under `/dsh-cool-terminal/api`: `context`, `open`, `stream` (SSE), `input`, `signal`, and `close`. It validates the request, resolves the target directory, and allocates one PTY per console through `ctx.subprocess.spawnTerminal`. Output is fanned out to attached browsers as base64 SSE frames; a bounded replay buffer lets a reloaded page rejoin the same shell. A request may carry `workspaceId`; the Host resolves that Workspace's canonical directory from its own `workspaceRegistry`, so the browser never names a path directly. Without `workspaceId` the session's own workdir is used. Requests that declare a foreign `Origin` are refused.
- **Client** (`lib/client.js`, declared by `dsh.client`) registers the tab into the `conversation.view` slot and drives it with `EventSource` plus `fetch`. Each console owns an xterm.js instance held outside React's tree, so switching tabs never tears a shell down. Its sidebar subscribes to the Client `workspaces` service through a child fiber, so the Workspace controller is an optional collaborator rather than a hard dependency. Each console row's overflow menu is the shipped `Menu` primitive from the platform-seeded `@deepseek-ai/dsh-client-ui-primitives` module.

An out-of-tree bundle cannot generate a `ctx.remote` namespace, so HTTP over the existing `webServer` is the supported bridge between the two halves. `@xterm/xterm` and its CSS are inlined into the client bundle at build time, because the platform's module loader loads this package as a single JS file.

## Notes and limits

- The terminal is a real local shell running as the DSH process user, **not** the confined one-shot shell: it is as privileged as a local shell, so treat these routes as localhost-trusted. The `subprocess` terminal primitive exposes no sandbox policy.
- Terminal geometry is fixed when a console is created, because the platform's terminal primitive has no resize verb; the browser measures its viewport before asking for a shell.
- Consoles are process-local and do not survive a DSH restart. A console with no browser attached for 15 minutes is closed automatically.
- Commands execute in the selected Workspace's directory (or the session directory). `cd` is remembered within one console, not across consoles.
- Deleting a Workspace's last console leaves that group empty (its `＋` button adds one back); console names live in browser storage, so they are per-browser, not per-session.

## Contributing

Contributions via Issues and PRs are welcome.

```
// Clone project
git clone https://github.com/CoolTea001/dsh-cool-terminal.git

// Install dependencies
cd dsh-cool-terminal
pnpm install

// Build
pnpm build
```

Then link the checkout into your profile and restart DSH:

```
dsh plugin --profile <your-profile> add .
```
