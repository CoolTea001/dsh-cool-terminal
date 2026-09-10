# dsh-cool-terminal

[English](./README.md) · 中文

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## 描述

DeepSeek Harness 插件 — 在每个会话的「对话」「轨迹」旁边加一个 **终端** tab，在会话工作目录里直接开一个真正的 shell。

## 功能介绍

- 在「对话」「轨迹」旁边加一个 **终端** tab，在会话工作目录里开一个真正的 shell。
- 终端按你的 DSH 工作区分组，目录不属于任何工作区时另有一个会话级终端。
- shell 状态、滚动历史和每个终端独立的命令历史，都能跨 tab 切换和刷新页面存活。
- 终端配色跟随当前主题，包括 `dsh-cool-theme` 的各种预设。

## 安装教程

一种最简单的方式是让你的 DSH 帮你安装，如果你想手动安装，请参考：

```
# 安装
dsh plugin --profile <your-profile> add dsh-cool-terminal

# 卸载
dsh plugin --profile <your-profile> remove dsh-cool-terminal
```

> 把 `<your-profile>` 替换成你的 DSH 使用的 profile，例如 web 端通常替换成 `web`，dsh-desktop 端通常替换成 `desktop`。

## 说明

- 终端运行的是真正的本机 shell，以 DSH 进程的用户身份执行，并非那个受限制的一次性 shell，请把这条路由视为仅限本机信任。
- 终端尺寸在创建时确定，因为平台的 terminal 原语没有 resize 接口。
- 终端是进程内状态，DSH 重启后不会保留；长时间没有浏览器连接的终端会在 15 分钟后自动关闭。
- 命令在所选工作区目录（或会话目录）执行，`cd` 会在同一个终端内保留，不跨终端。
- 命令历史保存在 `~/.dsh-cool-terminal/history`，按终端 id 命名。删除终端不会删除对应文件，想一次清空所有终端历史就删掉这个目录。
- PTY provider 会把每个 shell 的终端名强制成 `dumb`，而该 terminfo 条目没有光标移动和擦除能力。zsh 终端的启动 shim 会重新导出一个真实条目（优先 `xterm-256color`，否则 `xterm`），让行编辑、颜色和 `clear` 表现得像正常 xterm；如果你自己的 `.zshrc` 设置了 `TERM`，则以你的为准。

## 参与贡献

欢迎提交 Issue 和 PR。

```
// 克隆项目
git clone https://github.com/CoolTea001/dsh-cool-terminal.git

// 安装依赖
cd dsh-cool-terminal
pnpm install

// 启动本地开发
pnpm run dev

// 本地安装
dsh plugin --profile <your-profile> add /absolute/path/to/dsh-cool-terminal

// 重启 DSH 服务
dsh web
```

## 开源协议

MIT © CoolTea
