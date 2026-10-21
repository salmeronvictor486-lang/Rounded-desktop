#!/usr/bin/env node
'use strict';
// Stop (strict profile): before the agent finishes, ask it to account for code changed without tests.
const { run } = require('./lib/hook');
const { git } = require('./lib/project');

const CODE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|swift|ex|exs|scala|c|cc|cpp|h|hpp)$/;
const TEST = /(^|\/)(tests?|__tests__|spec|e2e)\/|[._-](test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/;

run('stop-check', 'strict', (input) => {
  // Never block twice in a row: that would trap the agent in a loop.
  if (!input || input.stop_hook_active) return;
  const cwd = input.cwd || process.cwd();
  const status = git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  if (!status) return;
  const files = status.split('\n').map((l) => l.slice(3).split(' -> ').pop());
  const code = files.filter((f) => CODE.test(f) && !TEST.test(f));
  const tests = files.filter((f) => TEST.test(f));
  if (!code.length || tests.length) return;
  return {
    block:
      `Rounded (strict): ${code.length} source file(s) changed without any test change (${code.slice(0, 5).join(', ')}). ` +
      'Add or update tests and run them, or state explicitly why no test is needed.',
  };
});
