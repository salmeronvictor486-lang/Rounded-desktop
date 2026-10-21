'use strict';
/**
 * OpenCode: subagents in agent/, commands in command/, rules in AGENTS.md.
 */
const path = require('path');
const fm = require('../frontmatter');
const { home, pick, inlineRules } = require('./common');

function base(scope, dir, env) {
  if (scope === 'project') return path.join(dir, '.opencode');
  const config = env.XDG_CONFIG_HOME ? path.resolve(env.XDG_CONFIG_HOME) : path.join(home(env), '.config');
  return path.join(config, 'opencode');
}

function agentDoc(agent) {
  const tools = String(agent.tools || '');
  const readOnly = tools && !/\b(Edit|Write)\b/.test(tools);
  const head = fm.stringify({ description: agent.description, mode: 'subagent' }, agent.body);
  // OpenCode expresses tool access as a map; read-only agents must not edit files.
  return readOnly ? head.replace('mode: subagent\n', 'mode: subagent\ntools:\n  write: false\n  edit: false\n') : head;
}

function plan(catalog, sel, { scope, dir, env }) {
  const b = base(scope, dir, env);
  const ops = [];
  for (const a of pick(catalog.agents, sel.agents)) ops.push({ kind: 'file', dest: path.join(b, 'agent', `${a.id}.md`), content: agentDoc(a) });
  for (const c of pick(catalog.commands, sel.commands)) {
    ops.push({ kind: 'file', dest: path.join(b, 'command', `${c.id}.md`), content: fm.stringify({ description: c.description }, c.body) });
  }
  const rules = catalog.rules.filter((r) => sel.ruleGroups.includes(r.group));
  if (rules.length) {
    const memory = scope === 'project' ? path.join(dir, 'AGENTS.md') : path.join(b, 'AGENTS.md');
    ops.push({ kind: 'block', dest: memory, content: inlineRules(rules) });
  }
  return { base: b, ops };
}

module.exports = { id: 'opencode', name: 'OpenCode', scopes: ['user', 'project'], plan, base, agentDoc, skips: ['skills', 'hooks'] };
