# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-21

First release of Rounded, an English toolkit for AI coding agents. It replaces the earlier Rounded Desktop office-suite prototype that lived in this repository (still available in the git history).

### Added

- 12 agents, 24 skills, 18 slash commands and 14 rules (common, TypeScript, Python, Go, Rust).
- Claude Code plugin and marketplace manifests.
- Safety and continuity hooks: `guard-bash`, `secret-scan`, `guard-paths`, `debug-statements`, `session-start`, `save-session`, `stop-check`, with `minimal`/`standard`/`strict` profiles.
- Dependency-free installer CLI (`rounded install | uninstall | list | doctor`) for Claude Code, Codex CLI, Cursor, Gemini CLI and OpenCode, with user and project scopes, `core`/`full` profiles, language detection, dry runs and safe handling of files you edited.
- Content validator, generated catalog, and tests for hooks and installer.
- Documentation in English and Spanish.
