---
description: How to approach tasks — understand, plan, implement in small verified steps, and report honestly
---

# Agent workflow

- **Understand first.** Read the relevant code and tests before changing anything. Match the existing patterns, naming and style of the surrounding code.
- **Plan non-trivial work.** For changes touching more than two files, outline the steps (or use `/plan`) before editing.
- **Small, verified steps.** After each meaningful change, run the narrowest relevant check (a test file, the type checker) before moving on.
- **Stay in scope.** Do what was asked. Note unrelated problems you find instead of fixing them silently.
- **Prefer simple solutions.** No new abstraction, dependency or configuration option unless the task needs it.
- **Report honestly.** State what you ran and what passed. If something failed, was skipped or could not be verified, say so with the output.
- **Ask when it matters.** If a requirement is ambiguous in a way that changes the design, or an action is destructive or hard to reverse, confirm before acting.
