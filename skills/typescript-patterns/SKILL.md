---
name: typescript-patterns
description: Idiomatic, type-safe TypeScript for applications and libraries — strict compiler settings, modelling data with unions, validating at boundaries, async patterns, module structure and testing. Use when writing or reviewing TypeScript or JavaScript code.
---

# TypeScript patterns

## Compiler settings

Enable `"strict": true`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` (for libraries) and `verbatimModuleSyntax`. Treat type errors as build failures.

## Model the domain with types

- Discriminated unions for states instead of optional flags:

```ts
type Load<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };
```

- Exhaustive `switch` with a `never` check so new variants fail to compile until handled:

```ts
function assertNever(x: never): never {
  throw new Error(`Unexpected: ${JSON.stringify(x)}`);
}
```

- Branded types for identifiers that must not be mixed: `type UserId = string & { readonly __brand: 'UserId' }`.
- `readonly` arrays and properties for data that should not change.
- Prefer `unknown` over `any`; narrow with type guards.

## Validate at the boundaries

Types disappear at runtime. Parse external data (HTTP bodies, environment variables, JSON files, local storage) with a schema validator (for example zod or valibot) and derive the TypeScript type from the schema. Inside the boundary, trust the types.

## Functions and modules

- Small, pure functions where possible; side effects at the edges.
- Explicit return types on exported functions; inference inside.
- Options objects instead of more than three positional parameters.
- Named exports; one concept per module; avoid barrel files that create import cycles and slow builds.
- No default-exported anonymous functions: names help stack traces and refactoring.

## Async

- Always `await` or return promises; enable `@typescript-eslint/no-floating-promises`.
- Run independent work concurrently with `Promise.all` (or `allSettled` when partial failure is fine), with a concurrency limit for large sets.
- Use `AbortController` for cancellation and timeouts of fetches and long operations.
- Errors: `catch (e: unknown)`, then narrow (`e instanceof Error`).

## Null handling

Use optional chaining and nullish coalescing (`a?.b ?? fallback`), not `||` when `0` or `''` are valid. Avoid non-null assertions (`!`) except where an invariant is proven nearby.

## Testing

Vitest or Jest for units, Testing Library for UI, Playwright for end-to-end. Type-test public library APIs with `expectTypeOf` or `tsd`.

## Avoid

- `enum` in new code (use union literal types or `as const` objects).
- Classes for plain data; use types and functions.
- Over-generic types that obscure intent. Generics should remove duplication, not add puzzles.
