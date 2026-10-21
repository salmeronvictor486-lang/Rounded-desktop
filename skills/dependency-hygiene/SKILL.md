---
name: dependency-hygiene
description: Choosing, updating and auditing third-party dependencies — evaluating packages before adding them, lockfiles, update cadence, vulnerability triage, licence checks and supply-chain risks. Use when adding a dependency, upgrading packages, handling audit warnings, or reviewing licences.
---

# Dependency hygiene

Every dependency is code you ship but did not write. Add them deliberately and keep them current.

## Before adding a dependency

Ask:
1. Can the standard library or an existing dependency do this in a few lines?
2. Is it maintained (recent releases, issues answered), widely used, and does it have a security policy?
3. What does it pull in transitively? (Check install size and dependency count.)
4. Does it run install scripts? Does it need network or native builds?
5. Is the licence compatible with your project (permissive like MIT/Apache-2.0/BSD vs copyleft like GPL/AGPL)?

## Lockfiles and versions

- Commit the lockfile; install with the frozen/clean command in CI (`npm ci`, `pnpm install --frozen-lockfile`, `uv sync --locked`, `cargo build --locked`).
- Use version ranges in libraries, exact locks in applications.
- Never edit lockfiles by hand; regenerate them with the package manager.

## Updating

- Automate update pull requests (Dependabot, Renovate) grouped sensibly (dev tooling together, framework separately).
- Patch and minor updates weekly when tests pass; majors deliberately, reading the changelog and migration guide.
- Update one major dependency per pull request so failures are attributable.

## Vulnerabilities

1. Run the audit tool: `npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, `bundle audit`, `osv-scanner`.
2. For each finding, check **reachability**: is the vulnerable function used, in production code, with attacker-controlled input?
3. Fix by upgrading; if no fix exists, mitigate (avoid the vulnerable API, add input validation) and document the decision with a review date.
4. Never "fix" by forcing a major downgrade without testing.

## Supply chain

- Watch for typosquats and new packages with few downloads and install scripts.
- Prefer packages with provenance or signed releases; consider `npm install --ignore-scripts` in CI where possible.
- Pin CI actions and container base images by digest.

## Licences

Keep a third-party notices file generated from the lockfile; review new licences in pull requests; avoid copyleft licences in proprietary distributions unless legal approves.
