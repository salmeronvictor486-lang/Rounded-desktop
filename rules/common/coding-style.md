---
description: Language-agnostic code quality rules — naming, function size, immutability, comments and error handling
---

# Coding style

- **Names reveal intent:** `pendingInvoices`, not `list2`; functions are verbs (`calculateTotal`), booleans read as questions (`isExpired`, `hasAccess`).
- **Small units:** a function does one thing; split when it needs a comment to separate sections or grows past ~50 lines. Files over ~500 lines are a smell.
- **Shallow nesting:** return early on invalid input; keep the happy path at the left margin.
- **Prefer immutability:** create new values instead of mutating shared ones; mutate only local state you own.
- **No magic values:** name constants; keep configuration out of logic.
- **Comments explain why,** not what. Delete commented-out code. Keep docstrings on public APIs accurate.
- **Handle errors explicitly** (see the `error-handling` skill): never swallow them, add context when re-raising.
- **No dead code, no duplicated logic.** Remove what is unused; extract what is copied three times.
- **Follow the project's formatter and linter;** do not hand-format against them.
