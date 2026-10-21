![dsh-cool-terminal 封面](https://cdn.cooltea.top/dsh-cool-terminal/readme-cover-v0.4.0.png)

# dsh-cool-terminal

[English](./README.md) · 中文

![license: MIT](https://img.shields.io/badge/license-MIT-green) ![node: >=22.19](https://img.shields.io/badge/node-%3E%3D22.19-blue)

## 描述

DeepSeek Harness 终端插件 — 真 shell、工作区同步、状态常驻、常用命令管理、命令补全。

## 功能介绍

- **按工作区自动分组** — 终端依据 DSH 工作区自动归类，多开也不失序。
- **状态跨会话、跨刷新持久化** — shell 会话、滚动缓冲与当前路径均常驻保存，切换会话或刷新页面后无缝衔接。
- **终端级独立命令历史** — 每个终端维护独立的历史记录，↑ 检索时互不干扰。
- **常用命令管理** — 新增/修改/删除/使用你创建的常用命令。
- **命令自动补全** — 在终端输入时，光标下方弹出匹配的常用命令；鼠标悬停或 `↑`/`↓` 选择、`回车` 填充到命令行。

## 安装教程

使用 DSH 的新增插件功能，输入包名：dsh-cool-terminal 即可。

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
