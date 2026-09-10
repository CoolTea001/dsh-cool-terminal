# dsh-cool-terminal

[English](./README.md) · 中文

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## 描述

DeepSeek Harness 插件 — 在每个会话的「对话」「轨迹」旁边加一个 **终端** tab，在会话工作目录里直接开一个真正的 shell。

## 功能介绍

- 对话视图里的第三个 tab，用独立 id 注册，随产品发布的「对话」「轨迹」不受影响。
- 左侧边栏列出与 DSH 自带侧边栏一致的工作区，数据实时来自 Client 的 `workspaces` 服务：新增、重命名、排序、删除工作区都会自动同步，无需刷新。
- 工作区分组默认全部收起，且不会预置任何终端，由你自己创建；命令在该工作区目录下执行。展开/收起状态按浏览器记住，点 `＋` 新建终端时会自动展开该分组。
- 当会话目录不是已登记的工作区时，会出现一个「当前会话」终端，保留原有的会话 `cwd` 行为。
- 每个终端都是**真 PTY**，由 xterm.js 渲染，行为与系统终端一致：
  - **行内输入** —— 输入发生在 shell 自己的提示符后面，由 shell 回显，而不是另起一个输入框。
  - **shell 自己的提示符** —— 带配色，当前路径始终可见，`cd` 之后立即更新。
  - **Ctrl+C** —— 直接送达前台进程组，和系统终端一样中断正在运行的命令。
- 每个终端独立保留 shell 状态：`cd`、导出的变量、正在运行的命令，都能跨 tab 切换**以及刷新页面**存活。刷新后的页面会重新接回自己原有的那个 shell，并重放最近输出。
- 每个终端有**独立的命令历史**：↑ 和 `history` 只回溯该终端自己执行过的命令，在这里输入的内容也不会写进你自己的 `~/.zsh_history`。历史是在敲下每条命令时就写入文件的，所以 DSH 重启（重启会直接杀掉所有 shell，而不是让它们正常退出）不会丢历史。
- 终端名称、每个终端的滚动历史（5000 行）以及最近激活的终端，都按浏览器记住。
- 终端配色跟随当前主题：背景、前景、光标、选区以及 16 个 ANSI 颜色都从平台的 `--dsw-alias-*` token 解析，因此浅色/深色基调以及任何主题预设（包括 `dsh-cool-theme`）都能生效，切换主题会就地重绘所有已打开的终端。

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
