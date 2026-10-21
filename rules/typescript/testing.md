---
description: TypeScript and JavaScript testing — runner conventions, Testing Library, network mocking, Playwright
globs: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/*.test.js,**/*.spec.js"
---

# TypeScript / JavaScript testing

- Use the project's runner (Vitest, Jest or `node:test`) and follow its file naming.
- UI: Testing Library queries by role, label and text; `user-event` for interaction; assert what users see.
- Mock HTTP at the network layer (for example MSW), not individual modules, for integration tests.
- Fake timers for time-dependent code; no real `setTimeout` waits.
- End-to-end: Playwright with role-based locators and auto-waiting assertions; no fixed sleeps.
