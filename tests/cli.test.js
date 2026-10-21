'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { main, parseArgs } = require('../src/cli');
const { load } = require('../src/catalog');
const { select, detectLanguages, CORE } = require('../src/profiles');
const installer = require('../src/installer');
const fm = require('../src/frontmatter');

/** Fresh fake home and project folder; returns a runner that captures output. */
function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rounded-cli-'));
  const home = path.join(root, 'home');
  const app = path.join(root, 'app');
  fs.mkdirSync(home);
  fs.mkdirSync(app);
  const env = { HOME: home, ROUNDED_HOME: path.join(home, '.rounded') };
  const run = (...args) => {
    const lines = [];
    const code = main(args, { env, out: (s) => lines.push(s), err: (s) => lines.push(s) });
    return { code, out: lines.join('\n') };
  };
  return { root, home, app, env, run };
}

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const catalog = load();

test('argument parsing', () => {
  assert.deepEqual(parseArgs(['install', '-t', 'claude,codex', '--profile=full', '-n']), { _: ['install'], target: 'claude,codex', profile: 'full', 'dry-run': true });
  assert.throws(() => parseArgs(['install', '--bogus']), /Unknown option/);
  assert.throws(() => parseArgs(['install', '--target']), /needs a value/);
});

test('profiles select the core set plus detected languages', () => {
  const sel = select(catalog, { profile: 'core', languages: ['python'] });
  assert.deepEqual(sel.agents, CORE.agents);
  assert.ok(sel.skills.includes('python-patterns'));
  assert.ok(!sel.skills.includes('go-patterns'));
  assert.deepEqual(sel.ruleGroups, ['common', 'python']);
  const full = select(catalog, { profile: 'full' });
  assert.equal(full.agents.length, catalog.agents.length);
  assert.equal(full.skills.length, catalog.skills.length);
  assert.throws(() => select(catalog, { profile: 'huge' }), /Unknown profile/);
  assert.throws(() => select(catalog, { languages: ['cobol'] }), /Unknown language/);
  const only = select(catalog, { profile: 'core', languages: [], only: ['rules'] });
  assert.deepEqual([only.agents, only.skills, only.commands, only.hooks], [[], [], [], false]);
});

test('language detection', () => {
  const { app } = sandbox();
  assert.deepEqual(detectLanguages(app), []);
  fs.writeFileSync(path.join(app, 'go.mod'), 'module x');
  fs.writeFileSync(path.join(app, 'pyproject.toml'), '');
  assert.deepEqual(detectLanguages(app), ['python', 'go']);
});

test('core profile always references existing content', () => {
  for (const id of CORE.agents) assert.ok(catalog.agents.some((a) => a.id === id), id);
  for (const id of CORE.skills) assert.ok(catalog.skills.some((s) => s.id === id), id);
  for (const id of CORE.commands) assert.ok(catalog.commands.some((c) => c.id === id), id);
});

test('install for Claude Code (user scope): files, rule imports and hooks', () => {
  const { home, run } = sandbox();
  const r = run('install');
  assert.equal(r.code, 0, r.out);
  const claude = path.join(home, '.claude');
  for (const id of CORE.agents) assert.ok(exists(path.join(claude, 'agents', `${id}.md`)), id);
  for (const id of CORE.commands) assert.ok(exists(path.join(claude, 'commands', `${id}.md`)), id);
  assert.ok(exists(path.join(claude, 'skills', 'tdd-workflow', 'SKILL.md')));
  const memory = read(path.join(claude, 'CLAUDE.md'));
  assert.match(memory, /@rounded\/rules\/common\/security\.md/);
  for (const line of memory.split('\n').filter((l) => l.startsWith('@'))) {
    assert.ok(exists(path.join(claude, line.slice(1))), `import target exists: ${line}`);
  }
  const settings = JSON.parse(read(path.join(claude, 'settings.json')));
  const cmd = settings.hooks.PreToolUse[0].hooks[0].command;
  assert.match(cmd, /^node ".*\/\.claude\/rounded\/hooks\/scripts\/guard-bash\.js"$/);
  assert.ok(exists(cmd.match(/"(.*)"/)[1]));
});

test('reinstalling is idempotent', () => {
  const { run } = sandbox();
  run('install');
  const r = run('install');
  assert.match(r.out, /0 written, \d+ unchanged, 0 removed, 0 skipped/);
});

test('existing user files and settings are preserved', () => {
  const { home, run } = sandbox();
  const claude = path.join(home, '.claude');
  fs.mkdirSync(path.join(claude, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(claude, 'commands', 'plan.md'), 'my own plan command');
  fs.writeFileSync(path.join(claude, 'CLAUDE.md'), '# My preferences\n\nAlways answer briefly.\n');
  const mine = { type: 'command', command: 'echo mine' };
  fs.writeFileSync(path.join(claude, 'settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [mine] }] } }));

  const r = run('install');
  assert.match(r.out, /plan\.md: a file you created already exists/);
  assert.equal(read(path.join(claude, 'commands', 'plan.md')), 'my own plan command');
  assert.match(read(path.join(claude, 'CLAUDE.md')), /^# My preferences[\s\S]*rounded:start/);
  const settings = JSON.parse(read(path.join(claude, 'settings.json')));
  assert.equal(settings.model, 'x');
  assert.deepEqual(settings.hooks.PreToolUse[0].hooks, [mine]);
  assert.ok(settings.hooks.PreToolUse.length > 1);

  run('uninstall');
  assert.equal(read(path.join(claude, 'commands', 'plan.md')), 'my own plan command');
  assert.equal(read(path.join(claude, 'CLAUDE.md')), '# My preferences\n\nAlways answer briefly.\n');
  assert.deepEqual(JSON.parse(read(path.join(claude, 'settings.json'))), { model: 'x', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [mine] }] } });
  assert.ok(!exists(path.join(claude, 'agents')), 'empty folders are removed');
});

test('files edited after install are kept on reinstall and uninstall unless --force', () => {
  const { home, run } = sandbox();
  run('install');
  const f = path.join(home, '.claude', 'agents', 'planner.md');
  fs.writeFileSync(f, 'customised');
  assert.match(run('install').out, /planner\.md: you edited this file/);
  assert.equal(read(f), 'customised');
  assert.match(run('uninstall').out, /kept .*planner\.md/);
  assert.equal(read(f), 'customised');
  // After an uninstall the edited file belongs to the user; --force takes it back
  assert.match(run('install').out, /planner\.md: a file you created/);
  run('install', '--force');
  assert.notEqual(read(f), 'customised');
  run('uninstall');
  assert.ok(!exists(f));
});

test('switching profiles removes files that are no longer selected', () => {
  const { home, run } = sandbox();
  run('install', '--profile', 'full');
  const architect = path.join(home, '.claude', 'agents', 'architect.md');
  assert.ok(exists(architect));
  const r = run('install', '--profile', 'core');
  assert.match(r.out, /[1-9]\d* removed/);
  assert.ok(!exists(architect));
});

test('dry run writes nothing', () => {
  const { home, run } = sandbox();
  const r = run('install', '--target', 'all', '--dry-run');
  assert.equal(r.code, 0);
  assert.match(r.out, /\[dry run\]/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('project install for every harness', () => {
  const { app, run } = sandbox();
  fs.writeFileSync(path.join(app, 'pyproject.toml'), '[project]\nname = "x"\n');
  const r = run('install', '--target', 'all', '--dir', app);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Detected languages: python/);

  // Claude Code: hooks use $CLAUDE_PROJECT_DIR so settings can be committed
  const settings = read(path.join(app, '.claude', 'settings.json'));
  assert.match(settings, /\$CLAUDE_PROJECT_DIR\/\.claude\/rounded\/hooks\/scripts\/secret-scan\.js/);
  assert.match(read(path.join(app, 'CLAUDE.md')), /@\.claude\/rounded\/rules\/python\/coding-style\.md/);

  // Cursor rules in .mdc format
  const mdc = read(path.join(app, '.cursor', 'rules', 'rounded-python-coding-style.mdc'));
  assert.match(mdc, /^---\ndescription: .+\nglobs: \*\*\/\*\.py,\*\*\/\*\.pyi\nalwaysApply: false\n---\n/);
  assert.match(read(path.join(app, '.cursor', 'rules', 'rounded-common-security.mdc')), /alwaysApply: true/);
  assert.doesNotMatch(read(path.join(app, '.cursor', 'commands', 'plan.md')), /\$ARGUMENTS/);

  // Codex and OpenCode share AGENTS.md: one block
  const agentsMd = read(path.join(app, 'AGENTS.md'));
  assert.equal(agentsMd.split('rounded:start').length - 1, 1);
  assert.match(agentsMd, /## Python/);
  assert.ok(exists(path.join(app, '.agents', 'skills', 'python-patterns', 'SKILL.md')));

  // Gemini commands as TOML
  const toml = read(path.join(app, '.gemini', 'commands', 'review.toml'));
  assert.match(toml, /^description = ".+"\nprompt = '''\n[\s\S]+\{\{args\}\}[\s\S]+\n'''\n$/);
  assert.match(read(path.join(app, 'GEMINI.md')), /# Rounded rules/);

  // OpenCode agents keep read-only agents read-only
  const plannerText = read(path.join(app, '.opencode', 'agent', 'planner.md'));
  assert.equal(fm.parse(plannerText).data.mode, 'subagent');
  assert.match(plannerText, /tools:\n {2}write: false\n {2}edit: false/);
  assert.match(read(path.join(app, '.opencode', 'command', 'tdd.md')), /\$ARGUMENTS/);

  // Uninstalling one AGENTS.md user keeps the shared block for the other
  run('uninstall', '--target', 'codex', '--dir', app);
  assert.match(read(path.join(app, 'AGENTS.md')), /rounded:start/);
  run('uninstall', '--target', 'opencode', '--dir', app);
  assert.ok(!exists(path.join(app, 'AGENTS.md')));

  run('uninstall', '--dir', app);
  assert.deepEqual(fs.readdirSync(app).sort(), ['pyproject.toml']);
});

test('Cursor is skipped for user installs instead of writing to the current folder', () => {
  const { run } = sandbox();
  const r = run('install', '--target', 'cursor');
  assert.match(r.out, /Cursor: skipped/);
});

test('doctor reports installations and missing files', () => {
  const { home, run } = sandbox();
  assert.match(run('doctor').out, /No installations recorded/);
  run('install');
  const ok = run('doctor');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /hooks registered in .*settings\.json: 8/);
  fs.rmSync(path.join(home, '.claude', 'agents', 'planner.md'));
  const bad = run('doctor');
  assert.equal(bad.code, 1);
  assert.match(bad.out, /1 missing/);
});

test('managed blocks', () => {
  const once = installer.upsertBlock('# Mine\n', 'A');
  const twice = installer.upsertBlock(once, 'B');
  assert.equal(twice.split('rounded:start').length - 1, 1);
  assert.match(twice, /^# Mine\n\n<!-- rounded:start[^\n]*\nB\n<!-- rounded:end -->\n$/);
  assert.equal(installer.removeBlock(twice).trim(), '# Mine');
});

test('list and help', () => {
  const { run } = sandbox();
  assert.match(run('list', 'commands').out, /\/plan/);
  assert.match(run('--help').out, /Usage/);
  assert.equal(run('frobnicate').code, 1);
  assert.equal(run('--version').out, catalog.version);
});
