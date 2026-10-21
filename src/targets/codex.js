'use strict';
/**
 * OpenAI Codex CLI: rules in AGENTS.md, skills in the shared Agent Skills folder (.agents/skills).
 * Codex has no equivalent of Rounded's subagents, slash commands or hooks, so those are not installed.
 */
const path = require('path');
const { home, pick, skillOps, inlineRules } = require('./common');

function base(scope, dir, env) {
  if (scope === 'project') return dir;
  return env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : path.join(home(env), '.codex');
}

function plan(catalog, sel, { scope, dir, env }) {
  const b = base(scope, dir, env);
  const ops = [];
  const skillsRoot = scope === 'project' ? path.join(dir, '.agents', 'skills') : path.join(home(env), '.agents', 'skills');
  for (const s of pick(catalog.skills, sel.skills)) ops.push(...skillOps(s, skillsRoot));
  const rules = catalog.rules.filter((r) => sel.ruleGroups.includes(r.group));
  if (rules.length) ops.push({ kind: 'block', dest: path.join(b, 'AGENTS.md'), content: inlineRules(rules) });
  return { base: b, ops };
}

module.exports = { id: 'codex', name: 'Codex CLI', scopes: ['user', 'project'], plan, base, skips: ['agents', 'commands', 'hooks'] };
