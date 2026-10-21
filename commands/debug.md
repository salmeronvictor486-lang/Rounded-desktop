---
description: Find the root cause of a bug systematically and fix it with a regression test
argument-hint: <symptom, error message or failing test>
---

Debug this problem: $ARGUMENTS

Use the **debugger** agent and the `systematic-debugging` skill:

1. Reproduce it reliably and capture the exact error output.
2. Gather evidence (logs, stack trace, recent changes, `git bisect` if a good version is known).
3. State hypotheses, test each one, and narrow down until the root cause is confirmed by evidence.
4. Fix the root cause, add a regression test that fails without the fix, and remove any temporary logging.
5. Report: root cause, evidence, fix (`path:line`) and the test.
