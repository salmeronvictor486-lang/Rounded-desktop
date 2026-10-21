---
description: Update documentation to match the code after a change
argument-hint: [what changed, or a path; default = recent changes]
---

Update the documentation for: $ARGUMENTS (if empty: the changes on this branch)

1. Find what changed (`git diff` against the base branch) and which docs describe it: README, docs folder, API references, configuration examples, changelog, code comments and docstrings.
2. Use the **doc-writer** agent and the `writing-docs` skill. Verify every command, option and default against the code; run commands where safe.
3. Make the smallest edits that make the docs correct and complete. Add a changelog entry for user-visible changes.
4. Report the files changed and anything you could not verify.
