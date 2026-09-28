# AGENTS.zh.md

## 提交与推送规则

1. 禁止主动 commit 和 push —— 只有用户明确要求时才执行 `git commit` / `git push`。先汇报改动，由用户决定何时提交或推送。
2. commit 前检查是否包含临时文件、大文件、敏感内容（密钥、token、.env）。
3. commit message 使用英文生成。

## 文档语言

1. `.md` 文件默认使用英文。
2. 同时添加 `.zh.md` 作为中文补充。
3. `.md` 和 `.zh.md` 需要同步更新。
