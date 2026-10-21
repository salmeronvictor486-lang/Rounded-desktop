---
name: ci-pipelines
description: Designing fast, reliable and secure continuous-integration pipelines — stage ordering, caching, parallelism, flaky-test policy, required checks and least-privilege tokens, with GitHub Actions examples. Use when creating or fixing CI workflows, speeding up builds, or hardening pipeline security.
---

# CI pipelines

CI exists to give fast, trustworthy feedback on every change. Slow or flaky CI gets ignored.

## Shape

1. **Fast checks first** (seconds): format, lint, type check.
2. **Unit tests** in parallel shards.
3. **Build** artefacts once; reuse them for later stages.
4. **Integration and end-to-end tests** against the built artefact.
5. **Security checks:** dependency audit, secret scanning, static analysis.
6. **Deploy** only from the main branch or tags, after required checks pass.

Fail fast: stop the pipeline at the first failing required stage.

## Speed

- Cache dependency downloads keyed on the lockfile hash.
- Run independent jobs in parallel; shard long test suites.
- Only run expensive jobs when relevant paths change (but keep required checks deterministic).
- Use `concurrency` groups to cancel superseded runs on the same branch.

## Reliability

- Pin tool and runtime versions (`.nvmrc`, `.tool-versions`, `rust-toolchain.toml`).
- Same commands locally and in CI: CI calls `npm run check` / `make check`, not a bespoke script only CI knows.
- Flaky tests are bugs: quarantine with an owner and a deadline, fix the cause, never auto-retry silently.
- Make the pipeline reproducible from a clean checkout.

## Security (GitHub Actions)

- Default `permissions: contents: read`; grant more per job only when needed.
- Pin third-party actions to a full commit SHA.
- Never echo secrets; avoid passing them to steps that run untrusted code. Be careful with `pull_request_target` — it runs with secrets on code from forks.
- Use OpenID Connect to cloud providers instead of long-lived keys.

## Example

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<full-commit-sha>  # pin
      - uses: actions/setup-node@<full-commit-sha>
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

## Required checks

Protect `main`: required status checks, at least one review, no direct pushes, linear history if the team prefers it.
