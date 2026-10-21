---
description: Run every quality gate (build, types, lint, tests, security audit) and report a ship/no-ship verdict
argument-hint: [optional: quick | full]
---

Verify the project is ready to commit or ship. Mode: $ARGUMENTS (if empty: full)

1. Detect the project's commands from package scripts, Makefile, task runners and CI configuration.
2. Run, in order, stopping to report at the first failing gate in quick mode and running everything in full mode:
   - format check and lint
   - type check / compile
   - unit and integration tests
   - build
   - dependency audit (full mode)
3. Check the diff for leftover debugging output, TODOs without context, secrets and unintended file changes.
4. Report a table of gates with pass/fail and the command used, then a verdict: **ready** or **not ready**, with the blocking items.
