# dsh-cool-terminal

English · [中文](./README.zh.md)

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## Description

DeepSeek Harness plugin that adds a **Terminal** tab next to `Chat` and `Trajectory` in every session, so a command can be run in the session workspace without leaving the conversation.

## Features

- A third Conversation View tab, registered into `conversation.view` with its own id — the shipped Chat and Trajectory tabs are untouched.
- A left sidebar listing the same Workspaces as DSH's own sidebar, read live from the Client `workspaces` service: creating, renaming, reordering, or deleting a Workspace shows up here without a reload.
- Workspace groups start collapsed and hold no console until you create one; each console runs in its group's directory. A group's expanded/collapsed state is remembered per browser, and its `＋` adds a console (revealing the group if it was collapsed).
- A session-bound console appears when the session directory is not a registered Workspace, so the tab keeps the original behavior (session `cwd`).
- Console names are persisted per browser, and every console keeps its own scrollback.
- Runs one foreground command at a time through the Host `shell` seam and prints stdout, stderr, and the exit code.
- Colors and surfaces follow the active theme tokens, so any theme preset (including `dsh-cool-theme`) applies.
- Scrollback survives switching tabs and is bounded to 800 lines per console; `清空` clears the active one.

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

- **Host** (`lib/index.js`) registers two same-origin routes, `POST /dsh-cool-terminal/api/exec` and `POST /dsh-cool-terminal/api/context`. It validates the request, resolves the target directory, and runs the command through `ctx.shell`. A request may carry `workspaceId`; the Host resolves that Workspace's canonical directory from its own `workspaceRegistry`, so the browser never names a path directly. Without `workspaceId` the session's own workdir is used.
- **Client** (`lib/client.js`, declared by `dsh.client`) registers the tab into the `conversation.view` slot and calls those routes with `fetch`. Its sidebar subscribes to the Client `workspaces` service through a child fiber, so the Workspace controller is an optional collaborator rather than a hard dependency. Each console row's overflow menu is the shipped `Menu` primitive from the platform-seeded `@deepseek-ai/dsh-client-ui-primitives` module (portal positioning, outside-click and Escape handling come from it).

An out-of-tree bundle cannot generate a `ctx.remote` namespace, so HTTP over the existing `webServer` is the supported bridge between the two halves.

## Notes and limits

- This is **not** a PTY: interactive programs (`vim`, `top`, `less`) do not work, and a command runs until it finishes or hits the shell timeout. A "console" is a named scrollback bound to a directory, not a persistent shell.
- Commands execute on the Host as the DSH process user, in the selected Workspace's directory (or the session directory). The terminal is user-driven, so it is as privileged as a local shell — treat the route as localhost-trusted.
- Each command starts a fresh process; `cd` does not persist between commands.
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
