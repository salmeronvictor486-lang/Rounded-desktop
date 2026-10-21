---
description: Measure test coverage, find the riskiest untested code, and add meaningful tests
argument-hint: [path or module; default = whole project]
---

Improve test coverage for: $ARGUMENTS (if empty: the whole project)

1. Run the project's coverage command (for example `vitest --coverage`, `jest --coverage`, `pytest --cov`, `go test -cover ./...`, `cargo llvm-cov`). If none is configured, say how to enable it and use the closest available option.
2. Rank uncovered code by risk: money, authentication, data deletion, parsing of external input, complex branching.
3. For the top items, write behavioural tests following the `writing-tests` skill. Each test must fail if the behaviour breaks; avoid tests that only execute lines.
4. Report coverage before and after, and the remaining high-risk gaps.
