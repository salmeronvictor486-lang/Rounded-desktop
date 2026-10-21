---
name: go-patterns
description: Idiomatic Go — package design, small interfaces, explicit error handling with wrapping, context propagation, safe concurrency, and table-driven tests. Use when writing or reviewing Go code.
---

# Go patterns

## Packages

- Name packages for what they provide (`invoice`, `storage`), not `utils` or `common`.
- Keep `main` thin: parse config, wire dependencies, start. Logic lives in packages under `internal/` unless meant for import by others.
- Avoid package-level mutable state; pass dependencies explicitly.

## Interfaces

- Define interfaces where they are consumed, with the methods the consumer needs ("accept interfaces, return structs").
- Small interfaces (one to three methods) compose better.
- Do not create interfaces for a single implementation "for testing" before you need them.

## Errors

- Check every error. Return early on error; keep the happy path unindented.
- Wrap with context: `fmt.Errorf("load invoice %d: %w", id, err)`.
- Inspect with `errors.Is` / `errors.As`; define sentinel errors (`var ErrNotFound = errors.New("not found")`) or typed errors for conditions callers handle.
- `panic` only for programmer errors that cannot be handled.

## Context

- First parameter of any function that does I/O or may block: `ctx context.Context`.
- Respect cancellation; pass the context down; never store it in a struct.
- Set deadlines at the edges (HTTP server, job runner).

## Concurrency

- Start goroutines with a clear owner and a way to stop them (context, closed channel).
- Use `errgroup.Group` for groups of goroutines that can fail; bound concurrency with `SetLimit`.
- Protect shared state with a mutex or confine it to one goroutine; prefer simple mutexes over clever channel choreography.
- Run tests with `-race` in CI.

## Testing

Table-driven tests with subtests:

```go
func TestParseAmount(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    int64
		wantErr bool
	}{
		{"whole", "12", 1200, false},
		{"cents", "12.34", 1234, false},
		{"invalid", "abc", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseAmount(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("got %d, want %d", got, tt.want)
			}
		})
	}
}
```

Use `httptest` for HTTP handlers, `t.TempDir()` for files, `t.Setenv` for environment.

## Tooling

`gofmt`/`goimports`, `go vet`, `staticcheck` or `golangci-lint`, `govulncheck` for dependencies.
