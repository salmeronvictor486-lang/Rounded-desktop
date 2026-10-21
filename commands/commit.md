---
description: Write a Conventional Commits message for the staged changes and commit
argument-hint: [optional hint about intent or scope]
---

Create a commit for the staged changes. Hint: $ARGUMENTS

1. Inspect `git diff --staged` (if nothing is staged, show `git status` and ask what to stage; do not stage everything blindly).
2. Check the staged diff for secrets, debugging output and unrelated changes; warn before committing any.
3. Write the message:
   - `type(scope): summary` in the imperative, at most 72 characters (`feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`).
   - A body explaining why the change is needed and anything non-obvious about how.
   - Footers for breaking changes (`BREAKING CHANGE:`) and issue references.
4. Commit. Do not push unless asked.
