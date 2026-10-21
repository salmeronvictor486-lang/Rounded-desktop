#!/usr/bin/env node
'use strict';
/**
 * Validates everything Rounded ships: front matter, naming, cross-references, manifests,
 * hook scripts, documentation counts and links, and that no secrets are committed.
 * Exit code 1 if anything is wrong. Run with `npm run validate`.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { load, listFiles, ROOT } = require('../src/catalog');
const { CORE, LANGUAGE_SKILLS } = require('../src/profiles');
const { scan } = require('../hooks/scripts/lib/secrets');
const { renderCatalog } = require('./catalog');

const errors = [];
const fail = (where, msg) => errors.push(`${path.relative(ROOT, where) || where}: ${msg}`);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'TodoWrite']);

const c = load();

function checkDoc(item, allowed) {
  for (const e of item.errors || []) fail(item.file, `front matter: ${e}`);
  for (const k of Object.keys(item.data || {})) if (!allowed.includes(k)) fail(item.file, `unexpected front matter key "${k}" (allowed: ${allowed.join(', ')})`);
  if (!item.body || item.body.trim().length < 80) fail(item.file, 'body is missing or too short');
  if (!/^#\s/m.test(item.body) && item.kind !== 'command' && item.kind !== 'agent') fail(item.file, 'body should start with a heading');
}

for (const a of c.agents) {
  checkDoc(a, ['name', 'description', 'tools', 'model']);
  if (a.name !== a.id) fail(a.file, `name "${a.name}" must match the file name "${a.id}"`);
  if (!KEBAB.test(a.id)) fail(a.file, 'file name must be kebab-case');
  if (!a.description || a.description.length < 60) fail(a.file, 'description must explain what the agent does and when to use it');
  else if (!/\bUse\b/.test(a.description)) fail(a.file, 'description should say when to use the agent ("Use when/for/after ...")');
  for (const t of String(a.tools || '').split(',').map((s) => s.trim()).filter(Boolean)) if (!TOOLS.has(t)) fail(a.file, `unknown tool "${t}"`);
}

for (const s of c.skills) {
  checkDoc(s, ['name', 'description', 'license', 'allowed-tools']);
  if (s.name !== s.id) fail(s.file, `name "${s.name}" must match the folder name "${s.id}"`);
  if (!KEBAB.test(s.id) || s.id.length > 64) fail(s.file, 'folder name must be kebab-case and at most 64 characters');
  if (!s.description) fail(s.file, 'description is required');
  else {
    if (s.description.length > 1024) fail(s.file, 'description must be at most 1024 characters');
    if (!/Use (when|for|before|after|whenever)/.test(s.description)) fail(s.file, 'description must say when to use the skill ("Use when ...")');
  }
}

for (const cmd of c.commands) {
  checkDoc(cmd, ['description', 'argument-hint', 'allowed-tools', 'model']);
  if (!KEBAB.test(cmd.id)) fail(cmd.file, 'file name must be kebab-case');
  if (!cmd.description) fail(cmd.file, 'description is required');
  else if (cmd.description.length > 160) fail(cmd.file, 'description should fit on one line (at most 160 characters)');
  if (cmd.argumentHint && !cmd.body.includes('$ARGUMENTS')) fail(cmd.file, 'has argument-hint but never uses $ARGUMENTS');
  if (!cmd.argumentHint && cmd.body.includes('$ARGUMENTS')) fail(cmd.file, 'uses $ARGUMENTS but has no argument-hint');
}

for (const r of c.rules) {
  checkDoc(r, ['description', 'globs']);
  if (!r.description) fail(r.file, 'description is required');
  if (r.group === 'common' && r.globs) fail(r.file, 'common rules apply everywhere and must not have globs');
  if (r.group !== 'common' && !r.globs) fail(r.file, 'language rules need globs');
  if (r.body.split('\n').length > 60) fail(r.file, 'rules are loaded into every session; keep them under 60 lines and move detail into a skill');
}

// Cross-references between content
const names = { agents: new Set(c.agents.map((a) => a.id)), skills: new Set(c.skills.map((s) => s.id)), commands: new Set(c.commands.map((x) => x.id)) };
for (const id of CORE.agents) if (!names.agents.has(id)) fail(path.join(ROOT, 'src/profiles.js'), `core agent "${id}" does not exist`);
for (const id of CORE.skills) if (!names.skills.has(id)) fail(path.join(ROOT, 'src/profiles.js'), `core skill "${id}" does not exist`);
for (const id of CORE.commands) if (!names.commands.has(id)) fail(path.join(ROOT, 'src/profiles.js'), `core command "${id}" does not exist`);
for (const [lang, ids] of Object.entries(LANGUAGE_SKILLS)) {
  if (!c.languages.includes(lang)) fail(path.join(ROOT, 'src/profiles.js'), `language "${lang}" has no rules folder`);
  for (const id of ids) if (!names.skills.has(id)) fail(path.join(ROOT, 'src/profiles.js'), `skill "${id}" does not exist`);
}
for (const item of [...c.agents, ...c.skills, ...c.commands, ...c.rules]) {
  for (const m of item.body.matchAll(/\*\*([a-z0-9-]+)\*\* agent/g)) if (!names.agents.has(m[1])) fail(item.file, `mentions unknown agent "${m[1]}"`);
  for (const m of item.body.matchAll(/`([a-z0-9-]+)` skill/g)) if (!names.skills.has(m[1])) fail(item.file, `mentions unknown skill "${m[1]}"`);
  // Skills talk about URL paths (`/users`), so only agents, commands and rules are checked for slash commands.
  if (item.kind === 'skill') continue;
  for (const m of item.body.matchAll(/(?:^|\s)`\/([a-z0-9-]+)(?:\s[^`]*)?`/g)) if (!names.commands.has(m[1])) fail(item.file, `mentions unknown command "/${m[1]}"`);
}

// Manifests
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
if (plugin.version !== pkg.version) fail(path.join(ROOT, '.claude-plugin/plugin.json'), `version ${plugin.version} differs from package.json ${pkg.version}`);
const entry = market.plugins.find((p) => p.name === plugin.name);
if (!entry) fail(path.join(ROOT, '.claude-plugin/marketplace.json'), `no entry for plugin "${plugin.name}"`);
else if (entry.version !== pkg.version) fail(path.join(ROOT, '.claude-plugin/marketplace.json'), `version ${entry.version} differs from package.json ${pkg.version}`);

// Hooks
if (!c.hooks || !c.hooks.hooks) fail(path.join(ROOT, 'hooks/hooks.json'), 'missing "hooks" object');
else {
  const EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd'];
  for (const [event, groups] of Object.entries(c.hooks.hooks)) {
    if (!EVENTS.includes(event)) fail(path.join(ROOT, 'hooks/hooks.json'), `unknown event ${event}`);
    for (const g of groups) {
      for (const h of g.hooks) {
        const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/scripts\/([\w./-]+\.js)/.exec(h.command);
        if (!m) fail(path.join(ROOT, 'hooks/hooks.json'), `command must run a script under \${CLAUDE_PLUGIN_ROOT}/hooks/scripts: ${h.command}`);
        else if (!fs.existsSync(path.join(ROOT, 'hooks/scripts', m[1]))) fail(path.join(ROOT, 'hooks/hooks.json'), `script not found: ${m[1]}`);
      }
    }
  }
}
for (const f of listFiles(path.join(ROOT, 'hooks/scripts')).concat(listFiles(path.join(ROOT, 'src')), listFiles(path.join(ROOT, 'bin')))) {
  if (!f.endsWith('.js')) continue;
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(f, `syntax error: ${r.stderr.split('\n')[0]}`);
}

// Documentation: counts, generated catalog, local links
const counts = { agents: c.agents.length, skills: c.skills.length, commands: c.commands.length, rules: c.rules.length };
for (const doc of ['README.md', 'docs/es/README.md']) {
  const p = path.join(ROOT, doc);
  if (!fs.existsSync(p)) {
    fail(p, 'missing');
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  for (const [kind, n] of Object.entries(counts)) {
    for (const m of text.matchAll(new RegExp(`\\b(\\d+) (${kind}|${{ agents: 'agentes', skills: 'skills', commands: 'comandos', rules: 'reglas' }[kind]})\\b`, 'g'))) {
      if (Number(m[1]) !== n) fail(p, `says "${m[0]}" but there are ${n} ${kind}`);
    }
  }
}
const catalogPath = path.join(ROOT, 'docs/CATALOG.md');
if (!fs.existsSync(catalogPath) || fs.readFileSync(catalogPath, 'utf8') !== renderCatalog(c)) fail(catalogPath, 'out of date: run `npm run catalog`');

const markdown = listFiles(ROOT).filter((f) => f.endsWith('.md') && !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}.git${path.sep}`));
for (const f of markdown) {
  const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), target))) fail(f, `broken link to ${target}`);
  }
}

// No secrets anywhere in the repository (the scanner's own tests build their samples at runtime)
for (const f of listFiles(ROOT)) {
  if (f.includes(`${path.sep}.git${path.sep}`) || f.includes(`${path.sep}node_modules${path.sep}`)) continue;
  if (fs.statSync(f).size > 1024 * 1024) continue;
  const found = scan(fs.readFileSync(f, 'utf8'));
  for (const s of found) fail(f, `line ${s.line}: looks like a committed ${s.name}`);
}

if (errors.length) {
  console.error(`Validation failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`Valid: ${counts.agents} agents, ${counts.skills} skills, ${counts.commands} commands, ${counts.rules} rules, ${c.hookScripts.length} hook files.`);
