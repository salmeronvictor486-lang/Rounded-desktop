---
description: Draft release notes and the next version number from commits since the last tag
argument-hint: [from tag; default = latest tag]
---

Draft release notes starting from: $ARGUMENTS (if empty: the most recent tag)

1. Find the starting point (`git describe --tags --abbrev=0`) and list commits since then (`git log <tag>..HEAD --pretty=format:'%h %s'`), plus merged pull request titles if available.
2. Propose the next version using semantic versioning (breaking change → major, feature → minor, fixes only → patch) and explain why.
3. Write user-facing notes grouped by Added / Changed / Deprecated / Removed / Fixed / Security, with upgrade instructions for breaking changes. Leave out internal-only commits (CI, refactors) unless they matter to users.
4. Show the draft; update `CHANGELOG.md` only if the user asks.
