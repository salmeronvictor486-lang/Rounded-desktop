---
name: git-workflow
description: Conventions for branches, commits, pull requests, rebasing, resolving conflicts and recovering from mistakes, including Conventional Commits messages. Use when committing, preparing a pull request, cleaning up history or untangling a git problem.
---

# Git workflow

## Branches

- Never commit directly to `main`. Create a short-lived branch per change: `feat/login-rate-limit`, `fix/csv-encoding`, `chore/upgrade-node`.
- Keep branches small enough to review in one sitting (roughly under 400 changed lines). Split big work into stacked or sequential pull requests.
- Update from the base branch often to keep conflicts small.

## Commits

- Each commit is one logical change that builds and passes tests.
- Message format (Conventional Commits):

```
<type>(<optional scope>): <imperative summary, ≤ 72 chars>

<why the change is needed and what it does, wrapped at ~72 chars>

<footer: BREAKING CHANGE: ..., Closes #123>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- The body explains *why*; the diff already shows *what*.
- Stage deliberately (`git add -p`) and review with `git diff --staged` before committing.
- Never commit secrets, generated artefacts, editor files or large binaries.

## Pull requests

A good description has: what changed, why, how it was tested, risks and rollout notes, and screenshots for UI changes. Link the issue. Keep the PR focused; unrelated cleanups go in their own PR.

## Rewriting history

- On your own unpublished branch, rewriting is fine: `git commit --amend`, `git rebase -i` (when interactive tools are available), `git rebase origin/main`.
- On shared branches, do not rewrite. Use `git revert` to undo and merge commits to integrate.
- If you must force-push your own branch, use `git push --force-with-lease`, never plain `--force`, and never on `main`.

## Conflicts

1. Understand both sides: `git log --merge -p <file>` shows the commits involved.
2. Resolve by intent, not by picking a side blindly. Run tests afterwards.
3. Regenerate lockfiles and generated files with their tools instead of hand-merging.

## Recovering

- Lost commit after a reset or rebase: `git reflog`, then `git branch rescue <sha>`.
- Undo the last commit but keep changes: `git reset --soft HEAD~1`.
- Discard local changes to one file: `git restore <file>` (destructive: confirm first).
- Committed a secret: rotate it immediately; then remove it from history with a history-rewriting tool and coordinate with everyone who has clones.
