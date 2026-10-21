---
description: Rust conventions — Result-based errors, no unwrap in production paths, clippy clean, documented unsafe
globs: "**/*.rs"
---

# Rust

- `cargo fmt` formatting; `cargo clippy -- -D warnings` clean.
- Return `Result`; propagate with `?`. Libraries define error enums (`thiserror`); applications add context (`anyhow`).
- No `unwrap()`/`expect()` in production paths unless the invariant is proven; prefer `expect("why this cannot fail")`.
- Borrow in parameters (`&str`, `&[T]`), own in return values; clone deliberately.
- Newtypes and enums to make invalid states unrepresentable.
- `unsafe` only in small, documented modules with a `// SAFETY:` comment per block.
- Never hold a lock across `.await`; never block inside async code.
