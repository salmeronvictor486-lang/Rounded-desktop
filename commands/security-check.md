---
description: Audit the codebase or current changes for security vulnerabilities and leaked secrets
argument-hint: [path or area to focus on]
---

Run a security review focused on: $ARGUMENTS (if empty: the whole project, prioritising code that handles external input)

1. Use the **security-reviewer** agent and the `security-review` skill checklist.
2. Map entry points (routes, CLI, uploads, webhooks, consumers) and follow untrusted data to dangerous sinks.
3. Check authentication and per-object authorisation, secrets in code and history (`git log -p -S` for suspicious strings), configuration (CORS, cookies, headers, TLS), and dependencies with the ecosystem's audit tool.
4. Report each issue with severity, `path:line`, a realistic exploit scenario and the fix. Never print secret values; say where they are.
5. List quick hardening wins separately from vulnerabilities.
