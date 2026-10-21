# Hooks

Rounded's hooks run on [Claude Code hook events](https://docs.claude.com/en/docs/claude-code/hooks). Each hook is a small Node.js script in [`hooks/scripts/`](../hooks/scripts/) registered in [`hooks/hooks.json`](../hooks/hooks.json). They need nothing but Node.js 18+.

## Design principles

- **Fail open.** A hook that crashes or receives unexpected input exits silently with code 0. A bug in Rounded must never block your work.
- **Deny only the catastrophic.** Hard blocks are reserved for actions that are almost never intended (wiping a disk, force-pushing over `main`, writing a live API key into source). Risky-but-legitimate actions *ask* for confirmation instead.
- **Fast.** Every hook finishes in milliseconds; the only external calls are short `git` commands with timeouts.
- **Local.** Nothing leaves your machine. Session notes are written to `~/.rounded/sessions/` with owner-only permissions.

## Reference

### `guard-bash` — PreToolUse (Bash)

Parses the proposed command (handling `&&`, `||`, `;`, pipes, quotes, `sudo`/`env` wrappers and `bash -c "..."`) and answers through Claude Code's permission decision.

| Decision | Commands |
|---|---|
| deny | `rm -r` on `/`, `~`, `$HOME` or system folders, `--no-preserve-root`; `mkfs`, `wipefs`, `dd of=/dev/sdX`, writing to raw disks; fork bombs; recursive `chmod`/`chown` on system folders; force-push (`--force`, `-f`, `+ref`) to `main`, `master`, `trunk`, `production`, `prod`, `release/*` — including a bare `git push --force` while on one of those branches |
| ask | `rm -rf .` / `..` / `*`; `git reset --hard`, `git clean -f`, `git checkout .`, `git restore .`, `git branch -D`, history rewriting; `--force-with-lease` to protected branches and any other force-push; `--no-verify`; pushes that delete or mirror refs; `curl … \| sh` and similar; `npm/pnpm/yarn publish`, `cargo publish`, `twine upload`, `gem push`; `terraform destroy` or `apply -auto-approve`; `kubectl delete`; `docker system prune -a`; `DROP`/`TRUNCATE` through database clients; `sudo` (strict profile only) |

In the `minimal` profile only denials are reported; confirmations are left to Claude Code's own permission settings.

### `secret-scan` — PreToolUse (Write, Edit, MultiEdit, NotebookEdit)

Scans the text about to be written for private keys, AWS, GitHub, GitLab, Slack, Stripe, Google, Anthropic, OpenAI, npm, Twilio and SendGrid credentials, JSON Web Tokens and database URLs with inline passwords. Obvious placeholders (`<password>`, `${DB_PASSWORD}`, `your-api-key`, `xxxxxx`, `EXAMPLE`) are ignored.

- In source files the write is **denied** with the reason, so the agent switches to an environment variable.
- In local env files (`.env`, `.env.local`, …) it **asks**, reminding you to keep the file git-ignored. `.env.example`/`.sample`/`.template` files are treated as source.

### `guard-paths` — PreToolUse (Write, Edit, MultiEdit, NotebookEdit) · standard

- deny: anything inside `.git/`
- ask: lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `uv.lock`, `go.sum`, …), files under `node_modules/`, `vendor/`, virtual environments, and key or certificate files

### `debug-statements` — PostToolUse (Write, Edit, MultiEdit) · standard

After an edit, looks at the *new* text only and reports leftover debugging output: `console.log/debug/trace/dir` and `debugger` (JS/TS), `breakpoint()`/`pdb` (Python), `binding.pry`/`byebug` (Ruby), `dbg!` (Rust), `var_dump`/`dd` (PHP), `printStackTrace()` (Java/Kotlin), `IO.inspect` (Elixir). Tests, scripts, CLIs and examples are exempt. The message goes to the agent; the edit itself is not undone.

### `session-start` — SessionStart

Adds a short block of context: project name and stack, current branch and number of uncommitted changes, the test/build/lint commands it found, your `.rounded/handoff.md` note (written by `/checkpoint`) and the snapshot saved at the end of the previous session.

### `save-session` — PreCompact, SessionEnd

Saves the last few user requests from the transcript and the list of uncommitted files to `~/.rounded/sessions/<project-id>.md`, so the next session (or the context after compaction) knows what you were doing.

### `stop-check` — Stop · strict

When the agent is about to finish and source files changed without any test file changing, it asks the agent to add tests or say why none are needed. It never blocks twice in a row.

## Configuration

| Variable | Effect |
|---|---|
| `ROUNDED_HOOK_PROFILE` | `minimal`, `standard` (default) or `strict` |
| `ROUNDED_DISABLED_HOOKS` | comma-separated hook ids to switch off, or `all` |
| `ROUNDED_HOME` | where session notes and install records live (default `~/.rounded`) |
| `ROUNDED_HOOK_DEBUG` | print hook errors to stderr instead of failing silently |

Set them in your shell profile, or per project in `.claude/settings.json` under `"env"`.

## Limits

Pattern matching cannot catch every dangerous command: obfuscated or generated commands, scripts that do damage internally, or tools Rounded does not know about will pass. Keep the usual protections: version control, backups, reviews, branch protection on the server, and credentials with the least privilege needed.
