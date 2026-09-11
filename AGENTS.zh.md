# AGENTS.zh.md

## 提交规则

1. commit 前检查是否包含临时文件、大文件、敏感内容（密钥、token、.env）。
2. commit message 使用英文生成。

## 文档语言

1. `.md` 文件默认使用英文。
2. 同时添加 `.zh.md` 作为中文补充。
3. `.md` 和 `.zh.md` 需要同步更新。

## Release notes

1. 向 `master` 推送版本号变更时，会自动创建 GitHub release（`.github/workflows/release.yml`）。
2. 英文 notes 由 conventional commits 生成，因此 commit 标题需保持 conventional 格式（`feat:` / `fix:` / `docs:` / `chore:` …）。
3. 添加 `.github/release-notes/zh/vX.Y.Z.md` 即可附带可折叠的中文 section；没有该文件时 release 只有英文。
4. 手动重跑该 workflow 并勾选 `update_existing`，可重新生成已发布 release 的正文。
