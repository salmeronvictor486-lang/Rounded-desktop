# Security policy

## Scope

Reports are welcome for:

- ways to make a Rounded hook **miss** a dangerous action it is documented to stop (for example a `rm -rf /` variant `guard-bash` lets through, or a credential format `secret-scan` misses);
- the installer writing, overwriting or deleting files outside what it documents, or mishandling paths;
- anything in Rounded's content that could lead an agent to weaken security (for example advice that disables TLS verification).

Rounded's hooks are a safety net, not a sandbox: an agent that deliberately obfuscates commands can get past pattern matching. Reports of that kind are still useful when the pattern is realistic.

## How to report

Please do **not** open a public issue. Use GitHub's private vulnerability reporting on this repository (**Security → Report a vulnerability**). Include the version, your tool (Claude Code, Codex, …), the input or steps that reproduce the problem, and the impact you expect.

You should get a first response within a week. Fixes are released as patch versions and credited in the changelog unless you prefer otherwise.

## Supported versions

Only the latest release receives fixes while the project is below 1.0.
