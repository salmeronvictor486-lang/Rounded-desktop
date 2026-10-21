---
description: Prepare a pull request — summary, testing notes, risks — from the current branch
argument-hint: [base branch; default = main]
---

Prepare a pull request for the current branch against: $ARGUMENTS (if empty: the default branch)

1. Read `git log <base>..HEAD` and `git diff <base>...HEAD --stat`, then the diff itself.
2. Run the project's checks (as in `/verify quick`) and note the results.
3. If the repository has a pull request template, fill in its sections.
4. Otherwise write: **Summary** (what and why), **Changes** (grouped bullets), **Testing** (commands and results, manual steps), **Risks and rollout** (migrations, flags, breaking changes), **Screenshots** for UI changes.
5. Show the description. Create the pull request only if the user asks and the tooling is available.
