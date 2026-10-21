---
description: Implement a feature or fix test-first with a red-green-refactor loop
argument-hint: <behaviour to implement or bug to fix>
---

Implement the following test-first: $ARGUMENTS

Follow the `tdd-workflow` skill (or the **tdd-guide** agent):

1. List the examples and edge cases this behaviour must satisfy.
2. For each example: write one failing test, run it and show that it fails for the right reason; write the minimal code to pass; refactor while green.
3. For a bug: start with a test that reproduces it.
4. Finish by running the full test suite, the type checker and the linter for this project.
5. Report the tests added, the commands run and their results.
