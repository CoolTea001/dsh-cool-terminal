# AGENTS.md

## Commit rules

1. Before committing, check for temporary files, large files, and sensitive content (keys, tokens, `.env`).
2. Write commit messages in English.

## Documentation language

1. `.md` files default to English.
2. Add a `.zh.md` as the Chinese companion.
3. `.md` and `.zh.md` must be updated together.

## Release notes

1. Pushing a version bump to `master` creates the GitHub release automatically (`.github/workflows/release.yml`).
2. English notes are generated from conventional commits, so keep commit subjects conventional (`feat:` / `fix:` / `docs:` / `chore:` …).
3. Add `.github/release-notes/zh/vX.Y.Z.md` to include a collapsible 中文 section; without that file the release stays English-only.
4. Re-run the workflow manually with `update_existing` to regenerate the body of an already-published release.
