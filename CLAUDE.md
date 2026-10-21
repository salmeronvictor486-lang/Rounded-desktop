# Working on Rounded

This repository is the source of Rounded: content (agents, skills, commands, rules), hook scripts and a dependency-free Node.js installer.

- Run `npm run check` (validator + tests) before finishing any change; run `npm run catalog` after adding, removing or renaming content.
- Content conventions are in `docs/authoring.md`; the validator (`scripts/validate.js`) enforces them.
- Hooks must fail open, stay dependency-free and fast, and have tests in `tests/hooks.test.js` (secret-like test strings are built at runtime, never written literally).
- The installer must never overwrite or delete files the user created or edited without `--force`; cover installer changes in `tests/cli.test.js` using temporary home folders.
- Keep README counts and both READMEs (`README.md`, `docs/es/README.md`) in sync.
