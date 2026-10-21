---
name: tdd-workflow
description: Red-green-refactor workflow for building features and fixing bugs test-first, with guidance on choosing the next test and keeping the loop short. Use when implementing new behaviour, fixing a bug, or when the user asks for TDD or tests first.
---

# Test-driven development

TDD is a design technique: each test is a small, executable specification, and the code grows only as far as the tests demand.

## The loop

1. **List examples** of the behaviour before writing code. Include the happy path, boundaries (0, 1, many, max), invalid input and failure of collaborators.
2. **Pick the simplest example that teaches you something** and write one failing test for it.
3. **Run it and read the failure.** It must fail on the assertion, not on a syntax error, missing import or wrong setup. A test that never failed proves nothing.
4. **Make it pass** with the least code. Faking a return value is fine if the next example will force the real logic.
5. **Refactor** production and test code while green: names, duplication, structure.
6. **Commit** when a meaningful slice is green. Small commits make it easy to back out a wrong turn.

## Choosing the next test

- Go from degenerate to general: empty input → single item → many items.
- Prefer the test that forces the next small, obvious change ("transformation priority": constant → variable → condition → loop).
- If a test needs a lot of setup, the design is telling you something: the unit has too many collaborators.

## Bugs

1. Write a test that reproduces the report exactly. Watch it fail.
2. Fix the cause. Watch it pass.
3. Ask whether similar inputs fail too, and add those cases.

## Levels

- **Unit tests** for logic: fast, isolated, most of your tests.
- **Integration tests** for boundaries: database queries, HTTP handlers, message consumers, with real dependencies where practical (containers, in-memory engines).
- **End-to-end tests** for a few critical journeys.

## Definition of done

- All new behaviour is covered by tests that would fail if it broke.
- The full suite, type checker and linter pass.
- Test names read as a specification of the feature.

## Anti-patterns

- Writing all tests after the code "to get coverage".
- Tests that assert implementation details (private method calls, internal state).
- Snapshot tests of large structures nobody reads.
- Disabling a failing test instead of understanding it.
