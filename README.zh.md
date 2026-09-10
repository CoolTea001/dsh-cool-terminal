# dsh-cool-terminal

[English](./README.md) · 中文

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## 简介

DeepSeek Harness 插件：在每个会话的「对话」「轨迹」旁边加一个 **终端** tab，在会话工作目录里直接开一个真正的 shell。

## 功能

- 在 `conversation.view` 插槽里用独立 id 注册第三个 Conversation View，随产品发布的「对话」「轨迹」不受影响。
- 左侧边栏列出与 DSH 自带侧边栏一致的工作区，数据实时来自 Client 的 `workspaces` 服务：新增、重命名、排序、删除工作区都会自动同步，无需刷新。
- 工作区分组默认全部收起，且不会预置任何终端，由你自己创建；命令在该工作区目录下执行。展开/收起状态按浏览器记住，点 `＋` 新建终端时会自动展开该分组。
- 当会话目录不是已登记的工作区时，会出现一个「当前会话」终端，保留原有的会话 `cwd` 行为。
- 每个终端都是**真 PTY**，由 xterm.js 渲染，行为与系统终端一致：
  - **行内输入** —— 输入发生在 shell 自己的提示符后面，由 shell 回显；光标就在输出流里，而不是另起一个输入框。
  - **shell 自己的提示符** —— `cooltea@MacBook-Air-2 deepseek-harness %`，带配色；当前路径始终可见，`cd` 之后立即更新。
  - **Ctrl+C** —— `⌃C` 直接送达前台进程组，和系统终端一样中断正在运行的命令。
- 没有工具栏：这一块就是终端本身。当前目录由 shell 自己的提示符承载，上面不再重复展示。
- 每个终端独立保留 shell 状态：`cd`、导出的变量、正在运行的命令都能跨 tab 切换存活；刷新页面会重新接回同一个 shell（最近输出会重放）。
- 终端名称按浏览器持久化，每个终端各自保留滚动历史（5000 行）。
- 终端配色跟随当前主题：背景、前景、光标、选区以及 16 个 ANSI 颜色都从 `--dsw-alias-*` token 解析（与随产品发布的 HTML ANSI 渲染器使用同一套映射），因此浅色/深色基调以及任何主题预设（包括 `dsh-cool-theme`）都能生效。切换主题会就地重绘所有已打开的终端。

## 安装

```
# 安装
dsh plugin --profile <your-profile> add dsh-cool-terminal

# 卸载
dsh plugin --profile <your-profile> remove dsh-cool-terminal
```

> 把 `<your-profile>` 换成你的 DSH profile，例如 DSH Web 用 `web`，DSH Desktop 用 `desktop`。

## 实现方式

这个包是一个 bundle，包含两半：

- **Host**（`lib/index.js`）在 `/dsh-cool-terminal/api` 下注册同源路由：`context`、`open`、`stream`（SSE）、`input`、`signal`、`close`。它校验请求、解析目标目录，并通过 `ctx.subprocess.spawnTerminal` 为每个终端分配一个 PTY。输出以 base64 的 SSE 帧分发给已连接的浏览器；有上限的重放缓冲区让刷新后的页面接回同一个 shell。请求可以带 `workspaceId`，Host 用自身的 `workspaceRegistry` 解析该工作区的规范目录，浏览器不能直接指定路径；不带 `workspaceId` 时沿用会话自己的工作目录。声明了外部 `Origin` 的请求会被拒绝。
- **Client**（`lib/client.js`，由 `dsh.client` 声明）把 tab 注册进 `conversation.view` 插槽，并用 `EventSource` 加 `fetch` 驱动它。每个终端拥有一个保存在 React 树之外的 xterm.js 实例，因此切换 tab 不会拆掉 shell。它的侧边栏通过子 fiber 订阅 Client 的 `workspaces` 服务，因此 Workspace controller 是可选的协作者，而不是硬依赖。每个终端行的更多菜单直接用平台种子模块 `@deepseek-ai/dsh-client-ui-primitives` 里随产品发布的 `Menu` 组件。

树外包无法生成 `ctx.remote` 命名空间，因此复用既有 `webServer` 的 HTTP 路由是两半之间受支持的桥接方式。`@xterm/xterm` 及其 CSS 在构建时被打进 client bundle，因为平台的模块加载器把本包当作单个 JS 文件加载。

## 说明与限制

- 终端是**真正的本机 shell**，以 DSH 进程的用户身份运行，并不是那个受限制的一次性 shell：权限等同于本机 shell，请把这条路由视为仅限本机信任。平台的 terminal 原语没有暴露 sandbox 策略。
- 终端尺寸在创建时确定，因为平台的 terminal 原语没有 resize 接口；浏览器会先测量自己的视口，再申请 shell。
- 终端是进程内状态，DSH 重启后不会保留。长时间没有浏览器连接的终端会在 15 分钟后自动关闭。
- 命令在所选工作区目录（或会话目录）执行。`cd` 会在同一个终端内保留，不跨终端。
- 删掉某个工作区的最后一个终端后该分组会变成空的（用它的 `＋` 再加回来）；终端名称存在浏览器本地，按浏览器而不是按会话保存。

## 参与贡献

欢迎通过 Issues 和 PR 参与。

```
// 克隆项目
git clone https://github.com/CoolTea001/dsh-cool-terminal.git

// 安装依赖
cd dsh-cool-terminal
pnpm install

// 构建
pnpm build
```

然后把 checkout 链接进你的 profile 并重启 DSH：

```
dsh plugin --profile <your-profile> add .
```
