---
name: error-handling
description: Patterns for handling errors deliberately — where to catch, how to add context, typed errors versus exceptions, retries and timeouts, and what to show users versus log. Use when writing code that can fail (I/O, network, parsing, external services) or when reviewing error paths.
---

# Error handling

Errors are part of the interface. Decide for every failure: who can act on it, and what information they need.

## Principles

1. **Fail fast on programmer errors.** Invalid arguments, broken invariants and impossible states should raise immediately and loudly (assertions, panics in development).
2. **Handle expected failures explicitly.** Network errors, missing files, invalid user input and conflicts are normal; model them in return types or documented exceptions.
3. **Catch only what you can handle.** Catch at the level that can do something useful: retry, fall back, translate into a user message, or clean up. Otherwise let it propagate.
4. **Never swallow errors.** An empty `catch` hides bugs. If you deliberately ignore an error, comment why.
5. **Add context when re-raising.** "failed to load invoice 42: connection refused" beats "connection refused". Keep the original cause (`raise ... from err`, `new Error(msg, { cause })`, `fmt.Errorf("...: %w", err)`).

## Boundaries

- **At the edge** (HTTP handler, CLI main, job runner): convert errors into a response or exit code, log once with full context, and return a safe message to the user.
- **Inside:** return or raise typed errors that callers can distinguish (`NotFound`, `Conflict`, `ValidationError`), not strings.
- **Log once.** Logging and re-throwing at every layer produces duplicate noise.

## Retries and timeouts

- Every network call has a timeout.
- Retry only idempotent operations and only on transient failures (timeouts, 429, 503, connection resets).
- Use exponential backoff with jitter and a cap on attempts; respect `Retry-After`.
- Add circuit breaking or fail-fast for dependencies that are down, so failures do not pile up.

## Resources

Release resources on every path: `finally`, `with`/`using`, `defer`, RAII. Transactions roll back on error.

## User-facing messages

- Say what happened and what the user can do: "We couldn't save your changes because you're offline. They're kept on this device and will sync when you reconnect."
- Never show stack traces, SQL, file paths or internal identifiers to users.
- Include a request or correlation ID so support can find the logs.

## Language notes

- **TypeScript/JavaScript:** always `await` promises or handle rejections; type `catch (e: unknown)` and narrow.
- **Python:** catch specific exceptions; avoid bare `except:`; use `contextlib` for cleanup.
- **Go:** check every returned error; wrap with `%w`; use `errors.Is/As` to inspect.
- **Rust:** `Result` with `?`; libraries define error enums (`thiserror`), applications add context (`anyhow`); avoid `unwrap()` outside tests and proven-infallible cases.
