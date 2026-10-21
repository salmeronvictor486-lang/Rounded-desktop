---
name: refactoring-safely
description: Step-by-step techniques for restructuring code without changing behaviour — characterisation tests, small reversible moves, dead-code removal, extracting modules and migrating callers incrementally. Use before extending messy code, during cleanups, and for large renames or module moves.
---

# Refactoring safely

Refactoring changes structure, never behaviour. Safety comes from tests and from small steps.

## 1. Secure the behaviour

- Run the existing tests; note the baseline.
- If coverage is thin, write **characterisation tests**: call the code with representative inputs and assert whatever it returns today. They document current behaviour, bugs included.
- For code that is hard to test, start with the outermost seam you can drive (an HTTP endpoint, a CLI command, a public function).

## 2. Move in small steps

Each step should take minutes and leave the code compiling and green:

- **Rename** a variable, function or file (use the IDE or language server, then search for string references).
- **Extract function / inline function.**
- **Move function** to the module that owns its data.
- **Introduce parameter object** for long parameter lists.
- **Replace conditional with polymorphism or a lookup table** when the same switch appears in several places.
- **Split phase:** separate parsing from processing, or computing from formatting.

Commit after each green step so you can bisect or revert.

## 3. Removing dead code

Confirm it is dead before deleting:
- No references in the repository (including tests, configs, templates, string-based lookups).
- Not exported from a public package or used by other services.
- Not reachable through reflection, dependency injection, routing tables or feature flags.
Deleting confirmed dead code is the cheapest refactor there is; version control remembers it.

## 4. Large changes: strangler pattern

1. Build the new implementation next to the old one behind an interface or flag.
2. Move callers one at a time, verifying each.
3. Delete the old implementation once nothing uses it.

This keeps every intermediate state shippable.

## 5. Things that are not refactoring

Bug fixes, new features, performance changes and dependency upgrades change behaviour. Do them in separate commits so reviewers can tell what is meant to change.

## Checklist before you finish

- Tests green, same count or more than the baseline.
- Public interfaces unchanged (or the change is intentional and documented).
- No leftover adapters, flags or TODOs from the migration without an owner.
