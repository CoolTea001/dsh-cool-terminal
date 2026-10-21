![dsh-cool-terminal cover](https://cdn.cooltea.top/dsh-cool-terminal/readme-cover-v0.4.0.png)

# dsh-cool-terminal

English · [中文](./README.zh.md)

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## Description

DeepSeek Harness terminal plugin — a real shell, workspace sync, persistent state, common-command management, and command completion.

## Features

- **Grouped by workspace** — Consoles are grouped by your DSH Workspaces automatically, staying tidy no matter how many you open.
- **Persistent across sessions and reloads** — Shell sessions, scrollback, and the current path are preserved across conversation switches and page reloads, picking up right where you left off.
- **Per-console command history** — Each console keeps its own history; pressing `↑` never pulls in commands from other consoles.
- **Common command management** — Add, edit, delete, and use the common commands you create.
- **Inline command completion** — Typing in a console pops matching common commands up under the caret; hovering a row or pressing `↑`/`↓` selects one, and `Enter` fills it into the command line without running it.

## Installation

Use DSH's add-plugin feature and enter the package name: `dsh-cool-terminal`.

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

// Local install: use DSH's add-plugin feature and enter the local project path

// Restart DSH service
dsh web
```

## License

MIT © CoolTea
