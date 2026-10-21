# Authoring guide

Everything Rounded installs is Markdown with a small YAML front matter block. Keep front matter to simple `key: value` lines (quote values that start with special characters); `npm run validate` enforces the format so every tool can read it.

## Agents — `agents/<name>.md`

```markdown
---
name: migration-reviewer
description: Reviews database migrations for locking, data loss and rollback safety. Use when a pull request adds or changes migrations.
tools: Read, Grep, Glob, Bash
---

You are … (role, method, output format, rules)
```

- `name` equals the file name, kebab-case.
- `description` says **what** the agent does and **when to use it** — the main agent decides to delegate based on this text.
- `tools`: give read-only agents only `Read, Grep, Glob, Bash`. Add `Edit, Write` only when the agent must change files.
- The body is the agent's system prompt: role, step-by-step method, output format, and the shortcuts it must not take.

## Skills — `skills/<name>/SKILL.md`

```markdown
---
name: graphql-design
description: Schema design, pagination, errors and performance for GraphQL APIs. Use when designing or reviewing GraphQL schemas and resolvers.
---

# GraphQL design
…
```

- Folder name equals `name` (kebab-case, at most 64 characters); `description` at most 1024 characters and must contain "Use when …".
- Write for a capable engineer who needs the specifics: checklists, safe and unsafe patterns, commands, short examples. Skip generic advice.
- Extra files (examples, templates, scripts) can live next to `SKILL.md`; link to them from it.

## Commands — `commands/<name>.md`

```markdown
---
description: One line shown in the command menu
argument-hint: <what the user types after the command>
---

Do X for: $ARGUMENTS
1. …
```

- `$ARGUMENTS` is replaced with what the user typed; include `argument-hint` exactly when you use it.
- Reference agents as `**agent-name** agent` and skills as `` `skill-name` skill `` — the validator checks these references exist, and other tools get a note telling the model to apply the method directly.
- Commands that change things outside the working tree (commit, push, publish) should say to do so only when the user asked.

## Rules — `rules/<group>/<name>.md`

```markdown
---
description: One line summary
globs: "**/*.kt,**/*.kts"
---

# Kotlin
- …
```

- `rules/common/` applies to every project and has no `globs`. Language folders need `globs`.
- Rules are loaded into every session: keep each file under 60 lines of short, checkable statements. Move explanations and examples into a skill.
- Adding a language: create `rules/<language>/`, add detection in `src/profiles.js` (`detectLanguages`) and, if there is a matching skill, map it in `LANGUAGE_SKILLS`.

## Hooks — `hooks/scripts/*.js`

- Use `run(id, minProfile, fn)` from `hooks/scripts/lib/hook.js`; return `{ json }`, `{ stdout }` or `{ block }`.
- Put the decision logic in `hooks/scripts/lib/` as pure functions and test it in `tests/hooks.test.js`, including the script's stdin/stdout protocol.
- Never let an exception escape, never block on slow work, never send data off the machine.
- Register the script in `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<file>.js`; the installer rewrites the path for non-plugin installs.

## Before opening a pull request

```bash
npm run catalog    # regenerate docs/CATALOG.md
npm run check      # validate + tests
```

Update the counts in `README.md` and `docs/es/README.md` if you added or removed items (the validator tells you).
