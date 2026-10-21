# Install Rounded from a local clone on Windows. Usage: .\install.ps1 [options]   (see .\install.ps1 --help)
# Defaults to `install`; pass `uninstall`, `list` or `doctor` as the first argument for other commands.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Rounded needs Node.js 18 or newer: https://nodejs.org/'
  exit 1
}

$major = [int](node -p 'process.versions.node.split(".")[0]')
if ($major -lt 18) {
  Write-Error "Rounded needs Node.js 18 or newer (found $(node --version))."
  exit 1
}

$commands = @('install', 'uninstall', 'list', 'doctor', 'help', '--help', '-h', '--version')
if ($args.Count -gt 0 -and $commands -contains $args[0]) {
  & node (Join-Path $root 'bin/rounded.js') @args
} else {
  & node (Join-Path $root 'bin/rounded.js') install @args
}
exit $LASTEXITCODE
