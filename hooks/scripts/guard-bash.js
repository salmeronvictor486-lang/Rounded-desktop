#!/usr/bin/env node
'use strict';
// PreToolUse(Bash): deny catastrophic commands, ask before risky ones.
const { run, preToolDecision, profile } = require('./lib/hook');
const { evaluate } = require('./lib/bash-rules');
const { branch } = require('./lib/project');

run('guard-bash', 'minimal', (input) => {
  const cmd = input && input.tool_input && input.tool_input.command;
  if (typeof cmd !== 'string') return;
  const needsBranch = /\bgit\b[\s\S]*\bpush\b/.test(cmd);
  const finding = evaluate(cmd, { strict: profile() === 'strict', currentBranch: needsBranch ? branch(input.cwd || process.cwd()) : null });
  if (!finding) return;
  // The minimal profile only blocks; confirmations are left to the harness's own permission system.
  if (finding.level === 'ask' && profile() === 'minimal') return;
  return { json: preToolDecision(finding.level, `Rounded guard: ${finding.reason}`) };
});
