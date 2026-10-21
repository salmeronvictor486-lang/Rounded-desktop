---
description: TypeScript and JavaScript conventions — strict types, unions over flags, validation at boundaries, async discipline
globs: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts,**/*.js,**/*.jsx,**/*.mjs,**/*.cjs"
---

# TypeScript / JavaScript

- `strict` mode on; no `any` (use `unknown` and narrow); no non-null `!` without a proven invariant nearby.
- Model states with discriminated unions and exhaustive `switch` checks, not boolean flags.
- Validate external data (requests, env, JSON, storage) with a schema; derive types from it.
- Always `await` or return promises; no floating promises. Use `Promise.all` for independent work.
- `const` by default; no `var`. Use `??` and `?.` instead of `||` when `0`/`''` are valid.
- Named exports; explicit return types on exported functions.
- No `console.log` in committed application code; use the project's logger.
- Prefer union literal types or `as const` objects over `enum`.
