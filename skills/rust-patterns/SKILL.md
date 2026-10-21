---
name: rust-patterns
description: Idiomatic Rust — ownership-friendly API design, error handling with Result, type-driven modelling, safe concurrency and async, unsafe discipline, and testing. Use when writing or reviewing Rust code.
---

# Rust patterns

## API design

- Accept borrowed data (`&str`, `&[T]`, `impl AsRef<Path>`) and return owned data.
- Use newtypes to give meaning and invariants to primitives (`struct Email(String)` constructed only through validation).
- Make invalid states unrepresentable with enums instead of flag combinations.
- Builders for types with many optional fields; `Default` where sensible.
- Implement standard traits (`Debug`, `Clone`, `PartialEq`, `Display`, `From`) where they make sense.

## Errors

- Libraries: an error enum per crate or module (with `thiserror`), with variants callers can match on.
- Applications: `anyhow::Result` with `.context("...")` at each layer.
- Propagate with `?`. Reserve `unwrap()`/`expect()` for tests and for invariants that are proven; prefer `expect("reason")` so the panic explains itself.

## Ownership and performance

- Clone deliberately, not to silence the borrow checker; often a restructure (shorter borrows, splitting structs) is better.
- Iterators over index loops; `collect` once at the end.
- `Cow<str>` when a function usually borrows but sometimes needs to allocate.
- Measure before reaching for `unsafe` or exotic data structures.

## Concurrency

- `Arc<Mutex<T>>` or `Arc<RwLock<T>>` for shared state; keep lock scopes short and never hold a lock across `.await`.
- Channels (`std::sync::mpsc`, `tokio::sync::mpsc`) to hand work between tasks.
- Async: one runtime (usually tokio); spawn tasks with clear ownership; use `tokio::select!` with cancellation in mind; never block inside async code (use `spawn_blocking`).

## Unsafe

Avoid it in application code. When necessary, isolate it in a small module, document the invariants in a `// SAFETY:` comment on every block, and test it under Miri.

## Testing

- Unit tests in a `#[cfg(test)] mod tests` next to the code; integration tests in `tests/`.
- Property tests (`proptest`) for parsers and data structures.
- Doc tests double as examples for public APIs.

## Tooling

`cargo fmt`, `cargo clippy -- -D warnings`, `cargo test`, `cargo audit` / `cargo deny` for dependencies.
