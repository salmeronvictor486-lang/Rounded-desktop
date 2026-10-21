---
description: Review current changes (or a branch) for bugs, security issues and missing tests
argument-hint: [base branch or files; default = uncommitted changes]
---

Review these changes: $ARGUMENTS (if empty: the uncommitted changes in the working tree)

1. Collect the diff: `git diff` and `git diff --staged` for uncommitted work, or `git diff <base>...HEAD` if a base branch was given.
2. Use the **code-reviewer** agent (and the **security-reviewer** agent if the change touches input handling, authentication, payments, files, external URLs or secrets).
3. Verify each finding by tracing a concrete failing scenario; drop findings you cannot substantiate.
4. Report findings ranked by severity with `path:line`, the scenario and a specific fix. Separate blocking issues from optional suggestions.
5. Do not modify code unless asked; offer to fix the blocking findings.
