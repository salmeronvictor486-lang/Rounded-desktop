---
description: Rust testing — unit tests beside code, integration tests in tests/, property tests, doc tests
globs: "**/*.rs"
---

# Rust testing

- Unit tests in `#[cfg(test)] mod tests` next to the code; integration tests in `tests/`.
- Property tests (`proptest`) for parsers, encoders and data structures.
- Keep doc examples compiling and passing (`cargo test --doc`).
- `#[should_panic(expected = "...")]` only for documented panics.
