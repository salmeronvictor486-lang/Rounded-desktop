# Supported tools

Rounded keeps one source of truth (Markdown files in this repository) and translates it into each tool's native format at install time. If a tool has no equivalent for a feature, that feature is skipped instead of being emulated badly.

## Claude Code

| Content | User scope (`~/.claude`) | Project scope (`<project>/.claude`) |
|---|---|---|
| Agents | `agents/<name>.md` | `.claude/agents/<name>.md` |
| Commands | `commands/<name>.md` | `.claude/commands/<name>.md` |
| Skills | `skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` |
| Rules | `rounded/rules/…`, imported from `~/.claude/CLAUDE.md` with `@` imports | `.claude/rounded/rules/…`, imported from `<project>/CLAUDE.md` |
| Hooks | scripts in `rounded/hooks/scripts/`, entries merged into `settings.json` | same, with `$CLAUDE_PROJECT_DIR` paths so `.claude/settings.json` can be committed |

`CLAUDE_CONFIG_DIR` is respected. The plugin (`/plugin install rounded@rounded`) provides agents, skills, commands and hooks; rules need the installer (`--only rules`).

## Codex CLI

| Content | User scope | Project scope |
|---|---|---|
| Skills | `~/.agents/skills/<name>/SKILL.md` | `<project>/.agents/skills/<name>/SKILL.md` |
| Rules | Rounded block in `~/.codex/AGENTS.md` (or `$CODEX_HOME/AGENTS.md`) | Rounded block in `<project>/AGENTS.md` |

Codex has no equivalent of Rounded's subagents, slash commands or hooks, so those are not installed; the skills cover the same methods (planning, TDD, review, debugging…).

## Cursor

Project scope only (Cursor stores user rules in its settings).

| Content | Location |
|---|---|
| Rules | `.cursor/rules/rounded-<group>-<name>.mdc` — common rules with `alwaysApply: true`, language rules attached by `globs` |
| Commands | `.cursor/commands/<name>.md` |

## Gemini CLI

| Content | User scope | Project scope |
|---|---|---|
| Commands | `~/.gemini/commands/<name>.toml` (`{{args}}` receives the arguments) | `<project>/.gemini/commands/<name>.toml` |
| Rules | Rounded block in `~/.gemini/GEMINI.md` | Rounded block in `<project>/GEMINI.md` |

## OpenCode (beta)

| Content | User scope (`~/.config/opencode`) | Project scope (`<project>/.opencode`) |
|---|---|---|
| Agents | `agent/<name>.md` with `mode: subagent`; read-only agents get `write: false`, `edit: false` | same |
| Commands | `command/<name>.md` | same |
| Rules | Rounded block in `AGENTS.md` | Rounded block in `<project>/AGENTS.md` |

`XDG_CONFIG_HOME` is respected. OpenCode support is marked beta because its configuration layout has changed between releases; please report problems.

## Shared files

`CLAUDE.md`, `AGENTS.md` and `GEMINI.md` may already contain your own instructions. Rounded only edits the section between `<!-- rounded:start … -->` and `<!-- rounded:end -->`. Codex and OpenCode share one block in a project's `AGENTS.md`; uninstalling one of them keeps the block while the other still uses it.
