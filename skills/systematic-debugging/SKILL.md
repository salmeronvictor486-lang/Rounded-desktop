---
name: systematic-debugging
description: A disciplined method for finding root causes — reproduce, observe, form hypotheses, bisect, fix and guard with a regression test — plus tactics for flaky tests, performance regressions and production-only bugs. Use whenever behaviour is wrong and the cause is not immediately obvious.
---

# Systematic debugging

Debugging is the scientific method applied to code: observe, hypothesise, predict, test.

## 1. Reproduce

- Write down the exact steps, input, environment and versions.
- Shrink the reproduction: remove steps and data until removing anything more makes the bug disappear.
- Turn it into an automated test as early as possible.

## 2. Observe

- Read the whole error and stack trace, top to bottom. The first frame in your code is usually more useful than the last frame in a library.
- Check logs around the failure time, not just the error line.
- Compare a working and a failing case: what differs (input, config, version, data, timing)?

## 3. Hypothesise and test

- State a falsifiable hypothesis: "the parser drops the last field when the line has no trailing newline".
- Predict an observation that would confirm or refute it, then check it with a log line, a debugger breakpoint, an assertion or a tiny script.
- Keep a short log of hypotheses and results; it stops you going in circles.

## 4. Narrow down

- **Bisect history:** `git bisect start; git bisect bad; git bisect good <sha>` then `git bisect run <test command>`.
- **Bisect code:** comment out or short-circuit half the path; see which half holds the bug.
- **Bisect data:** halve the input until the minimal failing input remains.

## 5. Fix the cause

Ask "why?" until the answer points at a decision in the code you can change. Fix there. Then look for siblings of the bug: the same mistake elsewhere.

## 6. Guard

Keep the reproduction as a regression test. Remove temporary logging. Explain the cause in the commit message.

## Special cases

- **Flaky tests:** run many times (`--repeat`, loops, parallel workers). Usual causes: shared state between tests, order dependence, real time or randomness, unawaited async work, external services. Fix the cause; never add retries to hide it.
- **Works locally, fails in CI:** diff environment variables, versions, time zone, locale, file system case sensitivity, available memory and CPU, network access.
- **Performance regression:** measure first, profile, compare against the last good version.
- **Production-only:** reproduce with production-like data and configuration; add targeted logging behind a flag; never debug by editing production directly.
