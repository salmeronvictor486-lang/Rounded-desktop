---
description: Git rules — feature branches, Conventional Commits, no force-push to shared branches, never commit secrets
---

# Git

- Work on a feature branch; never commit directly to `main`/`master`.
- One logical change per commit, each building and passing tests.
- Conventional Commits: `type(scope): imperative summary` (`feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`), with a body that explains why.
- Review `git diff --staged` before committing; never commit secrets, generated files, local configuration or large binaries.
- Do not rewrite shared history. On your own branch use `--force-with-lease`, never plain `--force`, and never on `main`.
- Do not use `--no-verify` to skip hooks; fix what they report.
- Commit, push or open pull requests only when the user has asked for it.
