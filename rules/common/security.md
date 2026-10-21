---
description: Security rules — no secrets in code, validate input at boundaries, parameterise queries, least privilege
---

# Security

- **No secrets in code,** tests, logs or commits. Read them from environment variables or a secret manager. If one leaks, rotate it.
- **Validate untrusted input** at the boundary with a schema (type, length, range, format).
- **Never build** SQL, shell commands, file paths or HTML by concatenating untrusted strings: use parameterised queries, argument arrays, path containment checks and framework escaping.
- **Check authorisation** for the specific resource on every request, not only authentication.
- **Fail closed:** on errors in security checks, deny.
- **Least privilege** for tokens, service accounts, CI jobs and database users.
- **Don't log** passwords, tokens or personal data; return generic error messages to clients.
- **Don't disable** TLS verification, CSRF protection or security headers to make something work.
