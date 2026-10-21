#!/usr/bin/env node
'use strict';
// PreCompact / SessionEnd: save a short snapshot (goals, branch, changed files) that the next session reads back.
const fs = require('fs');
const path = require('path');
const { run } = require('./lib/hook');
const { git, branch, sessionFile, recentPrompts } = require('./lib/project');

run('save-session', 'minimal', (input) => {
  const cwd = (input && input.cwd) || process.cwd();
  const prompts = recentPrompts(input && input.transcript_path);
  const branchName = branch(cwd);
  const status = (git(cwd, ['status', '--porcelain', '--untracked-files=all']) || '').split('\n').filter(Boolean);
  if (!prompts.length && !status.length) return;
  const out = [`Saved ${new Date().toISOString()} (${(input && input.hook_event_name) || 'snapshot'})${branchName ? ` on \`${branchName}\`` : ''}.`];
  if (prompts.length) out.push('', 'Recent requests:', ...prompts.map((p) => `- ${p}`));
  if (status.length) {
    out.push('', `Uncommitted files (${status.length}):`, ...status.slice(0, 15).map((s) => `- ${s.slice(3)} (${s.slice(0, 2).trim() || '?'})`));
    if (status.length > 15) out.push(`- …and ${status.length - 15} more`);
  }
  const file = sessionFile(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${out.join('\n')}\n`, { mode: 0o600 });
});
