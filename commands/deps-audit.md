---
description: Audit dependencies for vulnerabilities, outdated packages and licence issues, and propose safe updates
---

Audit this project's dependencies.

1. Detect the ecosystems (lockfiles and manifests) and run the audit tools available: `npm audit`/`pnpm audit`, `pip-audit`, `cargo audit`, `govulncheck`, `bundle audit`, `osv-scanner`.
2. For each vulnerability: severity, affected package and version, fixed version, whether the vulnerable code is reachable from this project, and the recommended action.
3. List outdated dependencies (`npm outdated`, `uv pip list --outdated`, `cargo outdated` if installed), separating patch/minor from major updates.
4. Flag licences that may conflict with the project's licence.
5. Propose an update plan in small, testable steps. Apply updates only if the user asks, one major upgrade at a time, running the tests after each.
