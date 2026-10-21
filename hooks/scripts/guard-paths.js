#!/usr/bin/env node
'use strict';
// PreToolUse(Write|Edit|MultiEdit|NotebookEdit): keep the agent out of files it should not edit by hand.
const { run, preToolDecision } = require('./lib/hook');
const { check } = require('./lib/paths');

run('guard-paths', 'standard', (input) => {
  const ti = (input && input.tool_input) || {};
  const f = check(String(ti.file_path || ti.notebook_path || ''));
  if (f) return { json: preToolDecision(f.level, `Rounded guard: ${f.reason}`) };
});

