---
description: Testing expectations — tests for every behaviour change, test-first for bugs, deterministic and fast suites
---

# Testing

- Every behaviour change comes with tests that would fail if the behaviour broke.
- Fix bugs test-first: reproduce with a failing test, then fix.
- Test behaviour through public interfaces; avoid asserting on internals or call counts of your own code.
- Tests are deterministic: no real time, randomness, network or order dependence.
- Keep the suite fast; unit tests run in milliseconds.
- Run the relevant tests before saying work is done, and the full suite before committing.
- Never delete, skip or weaken a failing test to get green. Fix the code or explain why the test is wrong.
