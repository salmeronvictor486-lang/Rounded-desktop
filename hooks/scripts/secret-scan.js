#!/usr/bin/env node
'use strict';
// PreToolUse(Write|Edit|MultiEdit|NotebookEdit): stop credentials from being written into files.
const path = require('path');
const { run, preToolDecision } = require('./lib/hook');
const { scan, writtenText } = require('./lib/secrets');

run('secret-scan', 'minimal', (input) => {
  const ti = (input && input.tool_input) || {};
  const found = scan(writtenText(ti));
  if (!found.length) return;
  const file = String(ti.file_path || ti.notebook_path || '');
  const kinds = [...new Set(found.map((f) => f.name))].join(', ');
  const base = path.basename(file);
  // Local env files are where secrets are supposed to live: ask instead of refusing.
  if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base)) {
    return { json: preToolDecision('ask', `Rounded secret scan: writing ${kinds} to ${base}. Make sure this file is git-ignored.`) };
  }
  return {
    json: preToolDecision(
      'deny',
      `Rounded secret scan: this change contains what looks like a ${kinds} (line ${found.map((f) => f.line).join(', ')}). ` +
        'Read it from an environment variable or a secret manager instead of hard-coding it.',
    ),
  };
});
