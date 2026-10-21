---
name: code-review
description: Checklist and method for reviewing code changes — correctness, security, data safety, tests, performance and maintainability — and for writing findings that are actionable. Use when reviewing a diff, a branch or a pull request, including your own changes before committing.
---

# Code review

A review answers one question: is this change safe and good enough to merge, and if not, what exactly must change?

## Prepare

- Read the description or the task first: what is the change supposed to do?
- Get the full diff (`git diff <base>...HEAD`) and the list of files.
- Run the tests and the build if you can; a review of red code is premature.

## Read in this order

1. Tests: they tell you the intended behaviour and what is not covered.
2. Public interfaces: new or changed functions, endpoints, schemas, configuration.
3. Implementation, following data from inputs to outputs.

## Checklist

**Correctness**
- Edge cases: empty, null, zero, negative, very large, unicode, duplicates, concurrent calls.
- Errors: are they handled, propagated with context, or swallowed?
- State: are invariants kept on every path, including early returns and exceptions?
- Time: time zones, daylight saving, clock skew, timeouts.

**Security**
- Untrusted input reaching SQL, shell, file paths, HTML, URLs or deserialisers.
- Authorisation checked for the specific resource, not just authentication.
- Secrets, tokens or personal data in code, logs or error messages.

**Data**
- Migrations safe under load and reversible; writes in transactions where needed; retries idempotent.

**Tests**
- New behaviour tested at the right level; tests fail when the code is wrong; no sleeps or order dependence.

**Performance**
- Queries in loops, unbounded result sets, repeated expensive work, large allocations on hot paths.

**Maintainability**
- Names say what things are; functions do one thing; no dead code or commented-out code; comments explain why, not what.

## Writing findings

- Lead with severity: **critical** (data loss, security hole, outage), **high** (wrong behaviour users will hit), **medium** (likely future bug, missing test), **low** (clarity, small cleanups).
- Give the location (`path:line`), the concrete failure scenario, and a specific fix.
- Separate blocking issues from suggestions. Mark optional ones as such.
- Verify before you report: if you cannot describe the input that breaks it, ask a question instead.
- Do not re-litigate formatting the tooling handles.

## Reviewing your own change

Before committing, read your diff as if someone else wrote it. Look especially for leftover debugging output, TODOs without context, accidental file changes and missing tests.
