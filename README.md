# dsh-cool-terminal

![dsh-cool-terminal cover](https://cdn.cooltea.top/dsh-cool-terminal/readme-cover-v0.1.0.png)

English · [中文](./README.zh.md)

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## Description

DeepSeek Harness terminal plugin — a real shell, a real working directory, persistent state.

## Features

- **Grouped by workspace** — Consoles are grouped by your DSH Workspaces automatically, staying tidy no matter how many you open.
- **Drag to reorder** — Consoles can be reordered by drag and drop within their own workspace group; the order survives reloads.
- **Persistent across sessions and reloads** — Shell sessions, scrollback, and the current path are preserved across conversation switches and page reloads, picking up right where you left off.
- **Per-console command history** — Each console keeps its own history; pressing `↑` never pulls in commands from other consoles.
- **Theme-aware** — Rendered with DSH theme variables, compatible with most theme plugins.

## Installation

Use DSH's add-plugin feature and enter the package name: `dsh-cool-terminal`.

## Current limitations

- Consoles run a real local shell as the DSH process user — this is not the confined one-shot shell, so treat them as a localhost-trusted environment.
- Consoles are process-local and do not survive a DSH restart.
- A console's size is fixed at creation; resizing is not supported yet.

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
