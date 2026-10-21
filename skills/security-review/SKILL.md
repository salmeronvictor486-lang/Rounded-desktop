---
name: security-review
description: Practical security checklist for application code — input handling, authentication and authorisation, secrets, data protection, dependencies and configuration — with safe patterns for each. Use when writing or reviewing code that handles user input, accounts, money, files, external URLs or secrets.
---

# Security review

Assume every input is hostile until validated, and every boundary is crossed by an attacker eventually.

## 1. Input and injection

| Sink | Unsafe | Safe |
|---|---|---|
| SQL | string concatenation | parameterised queries / query builder bindings |
| Shell | `exec("cmd " + arg)` | argument arrays (`execFile`, `subprocess.run([...])`), no shell |
| HTML | inserting raw strings | framework auto-escaping; sanitise user HTML with an allow-list |
| File paths | `join(base, userPath)` | resolve, then verify the result is inside `base`; reject `..` and absolute paths |
| URLs fetched by the server | any user URL | allow-listed hosts; block private, loopback and link-local ranges; no redirects to them |
| Deserialisation | `pickle`, `yaml.load`, Java serialisation of untrusted data | JSON with schema validation |
| Regex | user-supplied patterns, nested quantifiers on user input | fixed patterns, timeouts, linear-time engines |

Validate input at the boundary with a schema (types, lengths, ranges, formats) and reject what does not fit.

## 2. Authentication

- Passwords hashed with argon2id, bcrypt or scrypt; never plain hashes like SHA-256 alone.
- Rate-limit and add progressive delays to login, password reset and OTP endpoints.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`; rotate the session ID on login.
- Tokens: verify signature, algorithm, expiry, audience and issuer; keep lifetimes short; support revocation.
- Compare secrets in constant time.

## 3. Authorisation

- Check permission on **every** request for the **specific** object (`order.owner_id == user.id`), not only in the UI.
- Deny by default; centralise policy checks so new endpoints cannot forget them.
- Beware of mass assignment: bind only allowed fields from request bodies.

## 4. Secrets

- Never in source, tests, fixtures, logs, URLs or client bundles. Load from environment or a secret manager.
- `.env` files git-ignored; provide `.env.example` with placeholders.
- If a secret was committed, rotate it. Removing it from history is not enough.

## 5. Data protection

- TLS everywhere; never disable certificate verification.
- Encrypt sensitive data at rest where required; minimise what you store.
- Do not log passwords, tokens, full card numbers or personal data; mask identifiers.
- Error responses are generic; details go to server logs.

## 6. Web specifics

- CSRF protection for cookie-authenticated state-changing requests.
- CORS: explicit origins, no `*` with credentials.
- Headers: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame protection.
- File uploads: check type by content, cap size, store outside the web root, serve with `Content-Disposition: attachment` when not meant to render.

## 7. Dependencies and supply chain

- Run the ecosystem audit (`npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, `bundle audit`) and check reachability.
- Pin versions with a lockfile; review new dependencies (maintenance, downloads, install scripts).
- CI uses least-privilege tokens; third-party actions pinned to a commit SHA.

## Reporting

For each issue: severity, location, how an attacker exploits it, and the fix. Never paste live secrets into reports or chat.
