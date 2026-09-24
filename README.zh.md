# dsh-cool-terminal

![dsh-cool-terminal 封面](https://cdn.cooltea.top/dsh-cool-terminal/readme-cover-v0.1.0.png)

[English](./README.md) · 中文

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## 描述

DeepSeek Harness 终端插件 — 真 shell、真工作目录、状态常驻。

## 功能介绍

- **按工作区自动分组** — 终端依据 DSH 工作区自动归类，多开也不失序。
- **状态跨会话、跨刷新持久化** — shell 会话、滚动缓冲与当前路径均常驻保存，切换会话或刷新页面后无缝衔接。
- **终端级独立命令历史** — 每个终端维护独立的历史记录，↑ 检索时互不干扰。
- **主题自动适配** — 基于 DSH 主题变量渲染，兼容大多数主题插件。

## 安装教程

使用 DSH 的新增插件功能，输入包名：dsh-cool-terminal 即可。

## 目前存在的几个限制：

- 终端跑的是本机真正的 shell，以 DSH 进程的用户身份执行——它并不是那个受限的一次性 shell，请当成 localhost 可信环境来用。
- 终端是进程内状态，DSH 重启后不保留。
- 终端尺寸在创建时确定，暂时不能拖动改变大小。

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

// 本地安装：使用 DSH 的新增插件功能，输入本地项目路径即可

// 重启 DSH 服务
dsh web
```

## 开源协议

MIT © CoolTea
