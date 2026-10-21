#!/usr/bin/env sh
# Install Rounded from a local clone. Usage: ./install.sh [options]   (see ./install.sh --help)
# Defaults to `install`; pass `uninstall`, `list` or `doctor` as the first argument for other commands.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v node >/dev/null 2>&1; then
  echo "Rounded needs Node.js 18 or newer: https://nodejs.org/" >&2
  exit 1
fi

MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$MAJOR" -lt 18 ]; then
  echo "Rounded needs Node.js 18 or newer (found $(node --version))." >&2
  exit 1
fi

case "${1:-}" in
  install|uninstall|list|doctor|help|--help|-h|--version) exec node "$ROOT/bin/rounded.js" "$@" ;;
  *) exec node "$ROOT/bin/rounded.js" install "$@" ;;
esac
