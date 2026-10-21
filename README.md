<p align="center">
  <img src="assets/hero.svg" alt="Rounded — a well-rounded toolkit for AI coding agents" width="100%" />
</p>

<p align="center">
  <strong>Language:</strong> English | <a href="docs/es/README.md">Español</a>
</p>

<p align="center">
  <a href="https://github.com/salmeronvictor486-lang/Rounded-desktop/actions/workflows/ci.yml"><img src="https://github.com/salmeronvictor486-lang/Rounded-desktop/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js 18+" />
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero runtime dependencies" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-D97757" alt="Claude Code plugin" />
  <img src="https://img.shields.io/badge/Codex%20CLI-supported-000000" alt="Codex CLI" />
  <img src="https://img.shields.io/badge/Cursor-supported-1f2937" alt="Cursor" />
  <img src="https://img.shields.io/badge/Gemini%20CLI-supported-4285F4" alt="Gemini CLI" />
  <img src="https://img.shields.io/badge/OpenCode-beta-6b7280" alt="OpenCode" />
</p>

# Rounded

**Rounded turns a general-purpose AI coding agent into a disciplined teammate.** It bundles specialist agents, reusable skills, slash commands, always-on rules and safety hooks that encode how experienced engineers plan, test, review, secure and ship software — and installs them into the agent you already use.

- **12 agents** — planner, architect, code reviewer, security reviewer, TDD guide, build fixer, debugger and more.
- **24 skills** — TDD, code review, security, debugging, API design, migrations, performance, CI, containers, and idiomatic TypeScript, Python, Go, Rust and React.
- **18 commands** — `/plan`, `/tdd`, `/review`, `/verify`, `/debug`, `/checkpoint`, `/resume`, `/commit`, `/pr` and more.
- **14 rules** — short, always-loaded guidelines (common + per-language).
- **Safety hooks** — block catastrophic shell commands, stop secrets from being written to files, flag leftover debugging code, and carry context across sessions.

Everything is plain Markdown plus a small, dependency-free Node.js installer. Read it, change it, keep what you like.

> [!NOTE]
> Rounded is a young project (v0.1). The hooks are a safety net, not a sandbox: keep using version control, reviews and least-privilege credentials.

## Contents

- [Quick start](#quick-start)
- [What you get in each tool](#what-you-get-in-each-tool)
- [How to use it](#how-to-use-it)
- [Safety hooks](#safety-hooks)
- [Installer reference](#installer-reference)
- [Repository layout](#repository-layout)
- [Contributing](#contributing) · [Security](#security) · [License](#license)

## Quick start

### Claude Code (plugin, recommended)

Inside Claude Code:

```text
/plugin marketplace add salmeronvictor486-lang/Rounded-desktop
/plugin install rounded@rounded
```

Restart Claude Code. The agents, skills, commands and hooks are now available; try `/rounded:plan add rate limiting to the login endpoint`.

The plugin does not include the rules (Claude Code plugins cannot add always-on instructions). To add them, run the installer with `--only rules`:

```bash
npx github:salmeronvictor486-lang/Rounded-desktop install --only rules
```

### Any supported tool (installer)

Requires Node.js 18 or newer. No global install needed:

```bash
# Claude Code, everything in the core profile, into ~/.claude
npx github:salmeronvictor486-lang/Rounded-desktop install

# Several tools at once, with every agent and skill
npx github:salmeronvictor486-lang/Rounded-desktop install --target claude,codex,gemini,opencode --profile full

# Just one project (rules for the languages it uses are picked automatically)
npx github:salmeronvictor486-lang/Rounded-desktop install --target cursor,claude --dir ./my-app
```

Or clone the repository and run `./install.sh` (macOS/Linux) or `.\install.ps1` (Windows) with the same options.

Preview any change with `--dry-run`, and remove everything with `uninstall`.

## What you get in each tool

| | Claude Code | Codex CLI | Cursor | Gemini CLI | OpenCode (beta) |
|---|---|---|---|---|---|
| Agents | ✅ subagents | — | — | — | ✅ subagents |
| Skills | ✅ | ✅ `.agents/skills` | — | — | — |
| Commands | ✅ slash commands | — | ✅ `.cursor/commands` | ✅ TOML commands | ✅ |
| Rules | ✅ imported from `CLAUDE.md` | ✅ `AGENTS.md` | ✅ `.mdc` rules | ✅ `GEMINI.md` | ✅ `AGENTS.md` |
| Hooks | ✅ | — | — | — | — |
| Scopes | user, project | user, project | project | user, project | user, project |

Where a tool has no equivalent feature, Rounded leaves it out rather than faking it. Details: [docs/harnesses.md](docs/harnesses.md).

## How to use it

A typical feature, start to finish:

```text
/plan add CSV export to the reports page     → reads the code, writes .rounded/plan.md, waits for your OK
/tdd export reports as CSV                   → failing test first, then the code, then refactor
/review                                       → severity-ranked findings on your uncommitted changes
/verify                                       → lint, types, tests, build, audit → ready / not ready
/commit                                       → Conventional Commits message from the staged diff
/pr                                           → pull request description with testing notes
```

Long task or end of the day? `/checkpoint` commits finished work and writes `.rounded/handoff.md`; the next session shows it automatically, and `/resume` picks up from there.

Stuck on a bug? `/debug <symptom>` reproduces, bisects and proves the root cause before fixing it, and leaves a regression test behind.

The full list of agents, skills, commands and rules is in the **[catalog](docs/CATALOG.md)**.

### Profiles

| Profile | Installs |
|---|---|
| `core` (default) | six agents (planner, code-reviewer, security-reviewer, tdd-guide, build-fixer, debugger), the essential skills, nine everyday commands, common rules, hooks, plus language rules and skills for the languages you use |
| `full` | everything |

Language rules and skills follow `--languages typescript,python,go,rust`; for project installs they are detected from `package.json`, `pyproject.toml`, `go.mod` and `Cargo.toml`. React projects also get the React and accessibility skills.

## Safety hooks

Hooks run on Claude Code events. They are small Node.js scripts with no dependencies, fail open (a hook bug never breaks your session) and are covered by tests.

| Hook | Event | What it does | Profile |
|---|---|---|---|
| `guard-bash` | before shell commands | **Blocks** `rm -rf /` and home/system folders, disk formatting, fork bombs, force-pushes to `main`/`master`/`release`. **Asks** before `git reset --hard`, `git clean -f`, other force-pushes, `--no-verify`, `curl \| sh`, publishing packages, `terraform destroy`, `DROP TABLE` | minimal |
| `secret-scan` | before writing files | Refuses to write API keys, tokens, private keys and passwords in URLs into source files (asks for `.env` files) | minimal |
| `guard-paths` | before writing files | Blocks edits inside `.git/`; asks before hand-editing lockfiles, installed dependencies and key files | standard |
| `debug-statements` | after edits | Points out newly added `console.log`, `debugger`, `breakpoint()`, `dbg!` and similar | standard |
| `session-start` | session start | Adds project facts (stack, branch, uncommitted changes, test/build commands) and your last handoff note | minimal |
| `save-session` | before compaction, session end | Saves recent requests and changed files to `~/.rounded/sessions/` for the next session | minimal |
| `stop-check` | before the agent finishes | Asks the agent to add tests when source files changed without any test change (once per stop) | strict |

Tune them with environment variables:

```bash
export ROUNDED_HOOK_PROFILE=minimal   # minimal | standard (default) | strict
export ROUNDED_DISABLED_HOOKS=debug-statements,guard-paths
```

More in [docs/hooks.md](docs/hooks.md).

## Installer reference

```text
rounded install   [options]   Install into one or more tools
rounded uninstall [options]   Remove what Rounded installed (keeps files you edited)
rounded list      [kind]      List agents, skills, commands, rules or targets
rounded doctor                Check the environment and existing installations

-t, --target <ids>     claude, codex, cursor, gemini, opencode or all (default: claude)
-s, --scope <scope>    user or project (default: user; project when --dir is given)
-d, --dir <path>       Project folder for project installs
-p, --profile <name>   core or full (default: core)
-l, --languages <ids>  typescript, python, go, rust (default: detected / all)
    --only <kinds>     agents, skills, commands, rules, hooks
    --no-hooks         Skip hooks
-n, --dry-run          Show what would change without writing
-f, --force            Overwrite or delete files even if you edited them
```

The installer never overwrites a file you created or edited unless you pass `--force`. Shared files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `settings.json`) are edited only inside a clearly marked Rounded block or Rounded's own hook entries, and `uninstall` puts them back the way it found them. What was installed is recorded in `~/.rounded/installs/`.

## Repository layout

```text
agents/            Subagent definitions (Markdown + front matter)
skills/<name>/     Skills (SKILL.md)
commands/          Slash commands
rules/common/      Rules for every project
rules/<language>/  Language rules (typescript, python, go, rust)
hooks/             hooks.json and the hook scripts
.claude-plugin/    Claude Code plugin and marketplace manifests
src/, bin/         The installer CLI
scripts/           validate.js, catalog.js
tests/             node:test suites for hooks and installer
docs/              Catalog, hooks, harnesses, authoring guide, translations
```

## Contributing

Contributions are welcome: new skills, better agents, more languages and tools, translations. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [authoring guide](docs/authoring.md). Before opening a pull request:

```bash
npm run check   # validate content + run all tests
```

## Security

Found a way around a hook, or a vulnerability in the installer? Please report it privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Use it, fork it, adapt it to your team.
