---
name: writing-docs
description: Writing documentation people can use — READMEs, how-to guides, API references, architecture decision records and changelogs — with structure templates and a verification checklist. Use when creating or updating documentation of any kind.
---

# Writing documentation

Good documentation is correct, findable and short. Write for a reader who is trying to get something done.

## Pick the right type

| Type | Reader wants to… | Shape |
|---|---|---|
| Tutorial | learn by doing | step-by-step, guaranteed to work, minimal choices |
| How-to guide | accomplish a specific task | numbered steps for one goal, assumes basics |
| Reference | look up a fact | complete, consistent, structured like the code |
| Explanation | understand why | background, design decisions, trade-offs |

Mixing types makes all of them worse.

## README template

```
# Project name
One sentence: what it is and who it is for.

## Quick start
<copy-pasteable commands that work on a clean machine>

## Usage
<the most common tasks, with examples>

## Configuration
<options, defaults, environment variables>

## Development
<how to run tests, lint, build; how to contribute>

## License
```

## Style

- Lead with the action or the answer. Put conditions before instructions ("If you use Docker, run …").
- Short sentences, active voice, second person ("you"). Define jargon once or avoid it.
- Code blocks with the language tag; commands without prompts (`$`) so they copy cleanly; show expected output when it helps.
- Use tables for options and comparisons, lists for steps, and headings that match what people search for.
- Keep examples realistic but minimal.

## Accuracy

- Run every command and example before publishing.
- Generate references from code (OpenAPI, typedoc, docstrings) where possible.
- Put docs next to the code they describe and update them in the same pull request as the change.
- Date or version anything that will go stale.

## Decision records

Record significant decisions (architecture, major dependencies, conventions) as short ADRs: context, options, decision, consequences. They answer "why is it like this?" years later.

## Changelog

Follow "Keep a Changelog": sections Added, Changed, Deprecated, Removed, Fixed, Security; newest first; written for users, not as a commit dump.
