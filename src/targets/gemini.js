'use strict';
/**
 * Gemini CLI: rules in GEMINI.md, commands as TOML files in commands/.
 */
const path = require('path');
const { home, pick, inlineRules, commandPrompt } = require('./common');

function base(scope, dir, env) {
  return scope === 'project' ? path.join(dir, '.gemini') : path.join(home(env), '.gemini');
}

const tomlString = (s) => JSON.stringify(s);

function tomlCommand(cmd) {
  const prompt = commandPrompt(cmd, '{{args}}');
  // Literal multi-line strings need no escaping as long as the text has no ''' sequence.
  const body = prompt.includes("'''") ? tomlString(prompt) : `'''\n${prompt}\n'''`;
  return `description = ${tomlString(cmd.description || cmd.id)}\nprompt = ${body}\n`;
}

function plan(catalog, sel, { scope, dir, env }) {
  const b = base(scope, dir, env);
  const ops = [];
  for (const c of pick(catalog.commands, sel.commands)) ops.push({ kind: 'file', dest: path.join(b, 'commands', `${c.id}.toml`), content: tomlCommand(c) });
  const rules = catalog.rules.filter((r) => sel.ruleGroups.includes(r.group));
  if (rules.length) {
    const memory = scope === 'project' ? path.join(dir, 'GEMINI.md') : path.join(b, 'GEMINI.md');
    ops.push({ kind: 'block', dest: memory, content: inlineRules(rules) });
  }
  return { base: b, ops };
}

module.exports = { id: 'gemini', name: 'Gemini CLI', scopes: ['user', 'project'], plan, base, tomlCommand, skips: ['agents', 'skills', 'hooks'] };
