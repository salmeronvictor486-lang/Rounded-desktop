---
description: Go conventions — gofmt, explicit error handling with wrapping, context first, small consumer-side interfaces
globs: "**/*.go"
---

# Go

- `gofmt`/`goimports` formatting; `go vet` and the project linter clean.
- Check every error; wrap with context using `fmt.Errorf("...: %w", err)`; inspect with `errors.Is`/`errors.As`.
- `ctx context.Context` is the first parameter of functions that do I/O; never store contexts in structs.
- Define small interfaces where they are consumed; return concrete types.
- Every goroutine has an owner and a way to stop; use `errgroup` for concurrent work that can fail.
- No package-level mutable state; no `panic` for expected errors.
- Package names are short, lower-case and descriptive (no `util`).
