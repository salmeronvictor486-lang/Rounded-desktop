#!/usr/bin/env node
'use strict';
// SessionStart: give the model a short, factual picture of the project and of the previous session.
const fs = require('fs');
const path = require('path');
const { run } = require('./lib/hook');
const { git, branch, describe, sessionFile } = require('./lib/project');

run('session-start', 'minimal', (input) => {
  const cwd = (input && input.cwd) || process.cwd();
  const facts = describe(cwd);
  const lines = ['## Rounded: project context', `- Project: ${facts.name}${facts.stack.length ? ` (${facts.stack.join(', ')})` : ''}`];
  const branchName = branch(cwd);
  if (branchName) {
    const status = git(cwd, ['status', '--porcelain']) || '';
    const changed = status ? status.split('\n').length : 0;
    lines.push(`- Git: on \`${branchName}\`, ${changed ? `${changed} uncommitted change(s)` : 'clean working tree'}`);
  }
  const cmds = Object.entries(facts.commands);
  if (cmds.length) lines.push(`- Commands: ${cmds.map(([k, v]) => `${k}: \`${v}\``).join(', ')}`);
  try {
    const handoff = fs.readFileSync(path.join(cwd, '.rounded', 'handoff.md'), 'utf8').trim();
    if (handoff) lines.push('', '### Handoff note (.rounded/handoff.md)', handoff.split('\n').slice(0, 60).join('\n'));
  } catch {
    /* no handoff note */
  }
  try {
    const notes = fs.readFileSync(sessionFile(cwd), 'utf8').trim();
    if (notes) lines.push('', '### Notes saved at the end of the previous session', notes.split('\n').slice(0, 40).join('\n'));
  } catch {
    /* no previous session */
  }
  return { stdout: lines.join('\n') };
});
