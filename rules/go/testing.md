---
description: Go testing — table-driven subtests, httptest, t.TempDir, race detector
globs: "**/*_test.go"
---

# Go testing

- Table-driven tests with `t.Run` subtests and descriptive case names.
- `httptest` for handlers and clients; `t.TempDir()` and `t.Setenv` for files and environment.
- Run with `-race` in CI; use `t.Parallel()` where tests are independent.
- Compare structs with `cmp.Diff` (go-cmp) for readable failures.
