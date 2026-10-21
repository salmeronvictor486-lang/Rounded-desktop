---
name: release-management
description: Versioning and shipping releases predictably — semantic versioning, changelogs, release checklists, tags, pre-releases, deprecations and hotfixes. Use when preparing a release, choosing a version number, writing release notes, or planning a breaking change.
---

# Release management

## Semantic versioning

`MAJOR.MINOR.PATCH`:
- **PATCH:** backwards-compatible bug fixes.
- **MINOR:** backwards-compatible features and deprecations.
- **MAJOR:** breaking changes (removed or renamed APIs, changed behaviour or defaults, dropped platform support).

Before 1.0.0 anything may change, but treat minor bumps as potentially breaking and say so. Pre-releases: `2.0.0-rc.1`.

Conventional Commits make the version computable: `fix` → patch, `feat` → minor, `BREAKING CHANGE` footer or `!` → major.

## Release checklist

1. Main branch green; no open release-blocking issues.
2. Version bumped in every manifest that carries it (package files, plugin manifests, docs).
3. Changelog updated: user-facing summary grouped by Added / Changed / Deprecated / Removed / Fixed / Security, with upgrade notes for breaking changes.
4. Tag the release commit (`v1.4.0`), signed if the project signs tags.
5. Build artefacts from the tag in CI, not on a laptop; attach checksums or provenance.
6. Publish (package registry, container registry, store) and create release notes.
7. Verify the published artefact installs and runs from a clean environment.
8. Announce where users look (release page, changelog, community channels).

## Deprecations

- Announce in a minor release with a warning at runtime or build time that names the replacement.
- Keep the deprecated path working for at least one minor cycle (or the period you promise).
- Remove in the next major, with migration notes.

## Hotfixes

Branch from the release tag, fix with a test, release a patch, then merge or cherry-pick the fix back to main.

## Rollback

Know how to roll back before releasing: previous artefact still available, migrations compatible, feature flags to switch off new behaviour.
