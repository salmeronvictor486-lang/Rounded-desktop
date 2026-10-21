---
description: Get a failing build, type check or lint back to green with minimal, honest fixes
argument-hint: [failing command; default = detect from the project]
---

Fix the failing build: $ARGUMENTS

Use the **build-fixer** agent's procedure:

1. Run the failing command (detect it from package scripts, Makefile or CI config if not given) and read the first error carefully.
2. Group errors by root cause and fix one cause at a time, rerunning after each change.
3. No suppressions (`@ts-ignore`, `type: ignore`, lint disables, `any`), no skipped tests, no unexplained version pins.
4. Finish with the full build, type check, linter and tests, and report each root cause with its fix.
