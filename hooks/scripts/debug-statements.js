#!/usr/bin/env node
'use strict';
// PostToolUse(Write|Edit|MultiEdit): point out debugging statements the agent just added.
const { run } = require('./lib/hook');
const { find } = require('./lib/debug-statements');
const { writtenText } = require('./lib/secrets');

run('debug-statements', 'standard', (input) => {
  const ti = (input && input.tool_input) || {};
  const file = String(ti.file_path || '');
  const hits = find(file, writtenText(ti));
  if (!hits.length) return;
  const list = hits.slice(0, 5).map((h) => `  ${h.text}`).join('\n');
  // Exit 2 on PostToolUse shows the message to the model; the edit itself has already happened.
  return {
    block: `Rounded: the edit to ${file} added debugging output:\n${list}\nRemove it before finishing unless it is intentional (then use the project's logger).`,
  };
});
