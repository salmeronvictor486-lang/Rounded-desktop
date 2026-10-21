'use strict';
/**
 * Cursor: project rules as .cursor/rules/*.mdc and custom commands in .cursor/commands.
 * Cursor's user-level rules live in its settings UI, so only project installs are supported.
 */
const path = require('path');
const { pick, commandPrompt } = require('./common');

function base(scope, dir) {
  return path.join(dir, '.cursor');
}

/**
 * Cursor's rule format, written the way Cursor itself writes it: comma-separated globs, unquoted.
 * Common rules always apply; language rules attach to matching files.
 */
function mdc(rule) {
  const head = ['---', `description: ${rule.description.replace(/\n/g, ' ')}`, `globs: ${rule.globs || ''}`, `alwaysApply: ${rule.globs ? 'false' : 'true'}`, '---'];
  return `${head.join('\n')}\n\n${rule.body.replace(/^\n+/, '')}`;
}

function plan(catalog, sel, { scope, dir }) {
  if (scope !== 'project') throw new Error('Cursor keeps user rules in its settings UI. Install into a project with --scope project --dir <path>.');
  const b = base(scope, dir);
  const ops = [];
  for (const r of catalog.rules.filter((x) => sel.ruleGroups.includes(x.group))) {
    ops.push({ kind: 'file', dest: path.join(b, 'rules', `rounded-${r.group}-${r.id}.mdc`), content: mdc(r) });
  }
  for (const c of pick(catalog.commands, sel.commands)) {
    ops.push({ kind: 'file', dest: path.join(b, 'commands', `${c.id}.md`), content: `${commandPrompt(c, 'the text the user typed after this command')}\n` });
  }
  return { base: b, ops };
}

module.exports = { mdc, id: 'cursor', name: 'Cursor', scopes: ['project'], plan, base, skips: ['agents', 'skills', 'hooks'] };
