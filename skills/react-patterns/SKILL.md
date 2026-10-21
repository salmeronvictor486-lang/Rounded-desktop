---
name: react-patterns
description: Patterns for maintainable React applications — component boundaries, state placement, effects, data fetching, forms, performance and testing with Testing Library. Use when building or reviewing React components and hooks.
---

# React patterns

## Components

- Small components with one responsibility; extract when a component mixes data fetching, state logic and layout.
- Props describe what the component shows, not how the parent works. Avoid passing setters deep down; pass intent callbacks (`onSave`).
- Compose with `children` and slots instead of growing prop lists of booleans.

## State

- Keep state as close as possible to where it is used; lift it only when siblings need it.
- Derive values during render instead of storing them (`const total = items.reduce(...)`), unless the computation is expensive (then `useMemo`).
- Server state (data from APIs) belongs in a data-fetching library (TanStack Query, SWR, or the framework's loaders), not in global stores.
- Global client state only for truly global concerns (session, theme), via context or a small store.
- Model complex local state with `useReducer` and explicit actions.

## Effects

`useEffect` synchronises with external systems (subscriptions, timers, non-React widgets). It is not for:
- deriving state from props (compute during render),
- reacting to user events (do it in the event handler),
- fetching that a data library or loader should own.
Always clean up subscriptions and timers; list every dependency (keep the lint rule on).

## Forms

Use the platform: `<form onSubmit>`, labelled inputs, native validation attributes, then a schema validator for complex rules. Disable double submission; show errors next to fields and announce them to assistive tech.

## Performance

- Measure with the React Profiler before optimising.
- Virtualise long lists; split code by route with `lazy`/`Suspense`.
- Keep keys stable and unique (never array indexes for reorderable lists).
- `memo`/`useCallback` only where profiling shows re-render cost.

## Testing

- Testing Library: query by role, label and text the way users do; interact with `user-event`; assert visible results.
- Mock the network at the HTTP layer (for example MSW), not individual hooks.
- Cover loading, empty, error and success states.

## Accessibility

Semantic elements first (`button`, `a`, `nav`, `main`), visible focus, labelled controls, and keyboard support for everything clickable. See the `frontend-accessibility` skill.
