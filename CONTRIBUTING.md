# Contributing to Rounded

Thanks for helping. Rounded is useful only if its content is accurate and its tooling is boring and reliable, so contributions are reviewed for both.

## Good first contributions

- A **skill** for a framework, language or practice you know well (see the [authoring guide](docs/authoring.md)).
- Improvements to an existing agent, skill or command that you have tested in real work.
- **Rules** for a new language (with detection in `src/profiles.js`).
- Support or fixes for another coding tool (`src/targets/`).
- New cases for the hook test suite, especially false positives and misses in `guard-bash` and `secret-scan`.
- Translations of `README.md` into `docs/<language-code>/README.md`.

## Ground rules

- **Original content only.** Do not paste text from other projects, books or courses unless its licence allows it and you credit it.
- **Accurate over impressive.** Commands must work, file paths must exist, claims about tools must be verifiable. If you are not sure a tool supports something, say so or leave it out.
- **Concise.** Rules load into every session; skills load when relevant. Every line should earn its place.
- **No network calls, telemetry or new runtime dependencies** in hooks or the installer.

## Workflow

1. Fork and create a branch: `feat/skill-graphql`, `fix/guard-bash-false-positive`.
2. Make your change. For new content, follow the templates in [docs/authoring.md](docs/authoring.md).
3. Regenerate the catalog and run all checks:

   ```bash
   npm run catalog
   npm run check
   ```

4. Try it for real: `node bin/rounded.js install --dir /path/to/a/test/project --dry-run`, then without `--dry-run`, and use it in your coding tool.
5. Open a pull request using the template. Describe how you tested it.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).

## Reporting problems

Open an issue with the tool and version you use, what you ran, what happened and what you expected. For security problems, follow [SECURITY.md](SECURITY.md) instead.

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE) and that you follow the [code of conduct](CODE_OF_CONDUCT.md).
