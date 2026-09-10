# dsh-cool-terminal

[English](./README.md) · 中文

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## 简介

DeepSeek Harness 插件：在每个会话的「对话」「轨迹」旁边加一个 **终端** tab，不必离开对话就能在会话工作目录里跑命令。

## 功能

- 在 `conversation.view` 插槽里用独立 id 注册第三个 Conversation View，随产品发布的「对话」「轨迹」不受影响。
- 左侧边栏列出与 DSH 自带侧边栏一致的工作区，数据实时来自 Client 的 `workspaces` 服务：新增、重命名、排序、删除工作区都会自动同步，无需刷新。
- 工作区分组默认全部收起，且不会预置任何终端，由你自己创建；命令在该工作区目录下执行。展开/收起状态按浏览器记住，点 `＋` 新建终端时会自动展开该分组。
- 当会话目录不是已登记的工作区时，会出现一个「当前会话」终端，保留原有的会话 `cwd` 行为。
- 终端名称按浏览器持久化，每个终端各自保留滚动历史。
- 一次执行一条前台命令，经 Host 的 `shell` seam 运行，回显 stdout、stderr 与退出码。
- 配色与背景全部使用当前主题 token，所以任何主题预设（包括 `dsh-cool-theme`）都能生效。
- 切换 tab 不丢滚动历史，每个终端上限 800 行；`清空` 只清当前终端。

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

- **Host**（`lib/index.js`）注册两条同源路由：`POST /dsh-cool-terminal/api/exec` 与 `POST /dsh-cool-terminal/api/context`。它校验请求、解析目标目录，并通过 `ctx.shell` 执行命令。请求可以带 `workspaceId`，Host 用自身的 `workspaceRegistry` 解析该工作区的规范目录，浏览器不能直接指定路径；不带 `workspaceId` 时沿用会话自己的工作目录。
- **Client**（`lib/client.js`，由 `dsh.client` 声明）把 tab 注册进 `conversation.view` 插槽，并用 `fetch` 调用上面两条路由。它的侧边栏通过子 fiber 订阅 Client 的 `workspaces` 服务，因此 Workspace controller 是可选的协作者，而不是硬依赖。每个终端行的更多菜单直接用平台种子模块 `@deepseek-ai/dsh-client-ui-primitives` 里随产品发布的 `Menu` 组件（portal 定位、点击外部与 Escape 关闭都由它负责）。

树外包无法生成 `ctx.remote` 命名空间，因此复用既有 `webServer` 的 HTTP 路由是两半之间受支持的桥接方式。

## 说明与限制

- 这**不是** PTY：`vim`、`top`、`less` 这类交互式程序不可用；命令会一直运行到结束或触发 shell 超时。这里的「终端」是一个绑定目录、带独立滚动历史的命名控制台，不是常驻 shell。
- 命令以 DSH 进程的用户身份，在所选工作区目录（或会话目录）执行。终端由你手动驱动，因此权限等同于本机 shell——请把这条路由视为仅限本机信任。
- 每条命令都是独立进程，`cd` 不会在命令之间保留。
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
