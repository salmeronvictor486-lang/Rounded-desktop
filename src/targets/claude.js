'use strict';
/**
 * Claude Code: agents, commands and skills in their native folders, rules imported from CLAUDE.md,
 * hooks merged into settings.json.
 * Docs: https://docs.claude.com/en/docs/claude-code
 */
const fs = require('fs');
const path = require('path');
const { home, slash, pick, skillOps } = require('./common');

function base(scope, dir, env) {
  if (scope === 'project') return path.join(dir, '.claude');
  return env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(home(env), '.claude');
}

function plan(catalog, sel, { scope, dir, env }) {
  const b = base(scope, dir, env);
  const ops = [];
  for (const a of pick(catalog.agents, sel.agents)) ops.push({ kind: 'file', dest: path.join(b, 'agents', `${a.id}.md`), content: a.raw });
  for (const c of pick(catalog.commands, sel.commands)) ops.push({ kind: 'file', dest: path.join(b, 'commands', `${c.id}.md`), content: c.raw });
  for (const s of pick(catalog.skills, sel.skills)) ops.push(...skillOps(s, path.join(b, 'skills')));

  const rules = catalog.rules.filter((r) => sel.ruleGroups.includes(r.group));
  if (rules.length) {
    const memory = scope === 'project' ? path.join(dir, 'CLAUDE.md') : path.join(b, 'CLAUDE.md');
    const imports = [];
    for (const r of rules) {
      const dest = path.join(b, 'rounded', 'rules', r.group, `${r.id}.md`);
      ops.push({ kind: 'file', dest, content: r.raw });
      imports.push(`@${slash(path.relative(path.dirname(memory), dest))}`);
    }
    ops.push({ kind: 'block', dest: memory, content: ['## Rounded rules', '', ...imports].join('\n') });
  }

  if (sel.hooks && catalog.hooks) {
    const scriptsDir = path.join(b, 'rounded', 'hooks', 'scripts');
    for (const rel of catalog.hookScripts) {
      ops.push({ kind: 'file', dest: path.join(scriptsDir, rel), content: fs.readFileSync(path.join(catalog.root, 'hooks', 'scripts', rel), 'utf8') });
    }
    // Project installs use $CLAUDE_PROJECT_DIR so the settings file can be committed and shared.
    const prefix = scope === 'project' ? '$CLAUDE_PROJECT_DIR/.claude/rounded/hooks/scripts/' : `${slash(scriptsDir)}/`;
    const hooks = JSON.parse(JSON.stringify(catalog.hooks.hooks).split('${CLAUDE_PLUGIN_ROOT}/hooks/scripts/').join(prefix));
    ops.push({ kind: 'claude-hooks', dest: path.join(b, 'settings.json'), hooks });
  }
  return { base: b, ops };
}

module.exports = { id: 'claude', name: 'Claude Code', scopes: ['user', 'project'], plan, base };
