---
description: Refactor code without changing behaviour, protected by tests
argument-hint: <code or area to clean up, and the goal>
---

Refactor: $ARGUMENTS

Follow the `refactoring-safely` skill (or the **refactorer** agent):

1. Find the code and all its callers; confirm tests cover its behaviour, adding characterisation tests if they do not. Record the green baseline.
2. Make small, behaviour-preserving steps, running tests after each one.
3. Keep public interfaces stable unless the goal says otherwise. Do not mix in bug fixes or features; note any bugs you find.
4. Report what changed, what was removed, and test results before and after.
