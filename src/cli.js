'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('./catalog');
const { PROFILES, detectLanguages, select } = require('./profiles');
const { TARGETS, byId } = require('./targets');
const installer = require('./installer');

const HELP = `Rounded — agents, skills, commands, rules and safety hooks for AI coding agents

Usage
  rounded install   [options]   Install into one or more harnesses
  rounded uninstall [options]   Remove what Rounded installed (keeps files you edited)
  rounded list      [kind]      List agents, skills, commands, rules or targets
  rounded doctor                Check the environment and existing installations
  rounded --version | --help

Options
  -t, --target <ids>     claude, codex, cursor, gemini, opencode or all (comma-separated; default: claude)
  -s, --scope <scope>    user (your home folder) or project (default: user; project when --dir is given)
  -d, --dir <path>       Project folder for project installs (default: current folder)
  -p, --profile <name>   core (essentials) or full (everything) (default: core)
  -l, --languages <ids>  Language rules and skills to include, e.g. typescript,python
                         (default: detected from the project, or all for user installs)
      --only <kinds>     Restrict to agents,skills,commands,rules,hooks
      --no-hooks         Do not install hooks (Claude Code only has hooks)
  -n, --dry-run          Show what would change without writing anything
  -f, --force            Overwrite or delete files even if you edited them

Examples
  npx rounded-agent-kit install
  npx rounded-agent-kit install --target claude,codex --profile full
  npx rounded-agent-kit install --target cursor --dir ./my-app
  npx rounded-agent-kit uninstall --target all
`;

function parseArgs(argv) {
  const opts = { _: [] };
  const take = (i, name) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  const alias = { t: 'target', s: 'scope', d: 'dir', p: 'profile', l: 'languages', n: 'dry-run', f: 'force', h: 'help', v: 'version' };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a.startsWith('--') && a.includes('=')) {
      const [k, ...v] = a.slice(2).split('=');
      argv.splice(i + 1, 0, v.join('='));
      a = `--${k}`;
    }
    if (/^-[a-z]$/.test(a)) a = `--${alias[a[1]] || a[1]}`;
    if (!a.startsWith('--')) {
      opts._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (['dry-run', 'force', 'help', 'version', 'no-hooks', 'json'].includes(key)) opts[key] = true;
    else if (['target', 'scope', 'dir', 'profile', 'languages', 'only'].includes(key)) {
      opts[key] = take(i, a);
      i++;
    } else throw new Error(`Unknown option ${a}. Run "rounded --help".`);
  }
  return opts;
}

const list = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);

function resolveTargets(opt) {
  const ids = opt ? list(opt) : ['claude'];
  const all = ids.includes('all') ? TARGETS.map((t) => t.id) : ids;
  return all.map((id) => {
    const t = byId(id);
    if (!t) throw new Error(`Unknown target "${id}". Available: ${TARGETS.map((x) => x.id).join(', ')}, all.`);
    return t;
  });
}

function context(opts, env) {
  const dir = path.resolve(opts.dir || process.cwd());
  const scope = opts.scope || (opts.dir ? 'project' : 'user');
  if (!['user', 'project'].includes(scope)) throw new Error(`Unknown scope "${scope}". Use user or project.`);
  if (scope === 'project' && !fs.existsSync(dir)) throw new Error(`Project folder not found: ${dir}`);
  return { dir, scope, env };
}

function rel(p, env) {
  const h = env.HOME || '';
  return h && p.startsWith(h + path.sep) ? `~${p.slice(h.length)}` : p;
}

function install(opts, { env, out }) {
  const catalog = load();
  const ctx = context(opts, env);
  let languages = opts.languages ? list(opts.languages) : null;
  if (!languages && ctx.scope === 'project') {
    languages = detectLanguages(ctx.dir);
    out(`Detected languages: ${languages.length ? languages.join(', ') : 'none (installing common rules only)'}`);
  }
  const sel = select(catalog, {
    profile: opts.profile || 'core',
    languages,
    dir: ctx.scope === 'project' ? ctx.dir : null,
    only: opts.only ? list(opts.only) : null,
    hooks: !opts['no-hooks'],
  });
  let failed = false;
  for (const target of resolveTargets(opts.target)) {
    if (!target.scopes.includes(ctx.scope)) {
      out(`\n${target.name}: skipped — it supports only ${target.scopes.join('/')} installs. Use --dir <project> for it.`);
      continue;
    }
    const tctx = ctx;
    let planned;
    try {
      planned = target.plan(catalog, sel, tctx);
    } catch (e) {
      out(`\n${target.name}: ${e.message}`);
      failed = true;
      continue;
    }
    const report = installer.apply(planned.ops, {
      target: target.id, scope: tctx.scope, base: planned.base, version: catalog.version,
      dryRun: !!opts['dry-run'], force: !!opts.force, env,
    });
    out(`\n${target.name} (${tctx.scope}) → ${rel(planned.base, env)}${opts['dry-run'] ? '  [dry run]' : ''}`);
    out(`  ${report.written.length} written, ${report.unchanged.length} unchanged, ${report.removed.length} removed, ${report.skipped.length} skipped`);
    for (const s of report.skipped) out(`  ! ${rel(s.path, env)}: ${s.reason}`);
    if (target.skips) out(`  Not available in ${target.name}: ${target.skips.join(', ')}.`);
  }
  if (!opts['dry-run']) out('\nDone. Restart your coding agent to load the changes.');
  return failed ? 1 : 0;
}

function uninstall(opts, { env, out }) {
  const ctx = context(opts, env);
  const catalog = load();
  let found = 0;
  const targets = opts.target ? resolveTargets(opts.target) : TARGETS;
  for (const target of targets) {
    for (const scope of target.scopes) {
      if (opts.scope && scope !== opts.scope) continue;
      if (scope === 'project' && !opts.dir && !opts.scope && target.scopes.includes('user')) continue;
      const base = target.base(scope, ctx.dir, env);
      const report = installer.uninstall({ target: target.id, scope, base, dryRun: !!opts['dry-run'], force: !!opts.force, env });
      if (!report) continue;
      found++;
      out(`${target.name} (${scope}) → ${rel(base, env)}: removed ${report.removed.length}${report.kept.length ? `, kept ${report.kept.length}` : ''}${opts['dry-run'] ? '  [dry run]' : ''}`);
      for (const k of report.kept) out(`  ! kept ${rel(k.path, env)}: ${k.reason}`);
    }
  }
  void catalog;
  if (!found) out('Nothing to uninstall: no Rounded installation found for that target and scope.');
  return 0;
}

function listCmd(kind, { out }) {
  const c = load();
  const show = (title, items, fmt) => {
    out(`\n${title} (${items.length})`);
    for (const i of items) out(`  ${fmt(i)}`);
  };
  const first = (s) => String(s || '').split(/(?<=\.)\s/)[0];
  const k = kind || 'all';
  if (k === 'all' || k === 'agents') show('Agents', c.agents, (a) => `${a.id.padEnd(22)} ${first(a.description)}`);
  if (k === 'all' || k === 'skills') show('Skills', c.skills, (s) => `${s.id.padEnd(26)} ${first(s.description)}`);
  if (k === 'all' || k === 'commands') show('Commands', c.commands, (x) => `/${x.id.padEnd(18)} ${x.description}`);
  if (k === 'all' || k === 'rules') show('Rules', c.rules, (r) => `${`${r.group}/${r.id}`.padEnd(24)} ${r.description}`);
  if (k === 'all' || k === 'targets') show('Targets', TARGETS, (t) => `${t.id.padEnd(10)} ${t.name} (${t.scopes.join(', ')})`);
  if (!['all', 'agents', 'skills', 'commands', 'rules', 'targets'].includes(k)) throw new Error(`Unknown kind "${k}".`);
  return 0;
}

function doctor({ env, out }) {
  const c = load();
  const major = Number(process.versions.node.split('.')[0]);
  out(`Rounded ${c.version}`);
  out(`${major >= 18 ? 'ok ' : 'ERR'} Node.js ${process.versions.node}${major >= 18 ? '' : ' (18 or newer required)'}`);
  out(`ok  Catalog: ${c.agents.length} agents, ${c.skills.length} skills, ${c.commands.length} commands, ${c.rules.length} rules`);
  const states = installer.allStates(env);
  if (!states.length) out('--  No installations recorded yet. Run "rounded install".');
  let problems = 0;
  for (const { state } of states) {
    const missing = state.files.filter((f) => !fs.existsSync(f.path));
    const t = byId(state.target);
    out(`${missing.length ? 'WARN' : 'ok '} ${t ? t.name : state.target} (${state.scope}) v${state.version} → ${rel(state.base, env)}: ${state.files.length} files${missing.length ? `, ${missing.length} missing (reinstall to repair)` : ''}`);
    if (missing.length) problems++;
    for (const s of state.settings || []) {
      try {
        const settings = JSON.parse(fs.readFileSync(s.path, 'utf8'));
        const ours = JSON.stringify(settings.hooks || {}).split(installer.HOOK_MARKER).length - 1;
        out(`${ours ? 'ok ' : 'WARN'}   hooks registered in ${rel(s.path, env)}: ${ours}`);
        if (!ours) problems++;
      } catch {
        out(`ERR    ${rel(s.path, env)} is missing or not valid JSON`);
        problems++;
      }
    }
    if (state.version !== c.version) out(`--     installed version ${state.version} differs from ${c.version}; run "rounded install" to update`);
  }
  out(`Hook profile: ${env.ROUNDED_HOOK_PROFILE || 'standard (default)'}${env.ROUNDED_DISABLED_HOOKS ? `, disabled: ${env.ROUNDED_DISABLED_HOOKS}` : ''}`);
  return problems ? 1 : 0;
}

function main(argv, { env = process.env, out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`) } = {}) {
  try {
    const opts = parseArgs([...argv]);
    if (opts.version) {
      out(load().version);
      return 0;
    }
    const [cmd, arg] = opts._;
    if (opts.help || !cmd || cmd === 'help') {
      out(HELP);
      return 0;
    }
    if (opts.profile && !PROFILES.includes(opts.profile)) throw new Error(`Unknown profile "${opts.profile}". Use ${PROFILES.join(' or ')}.`);
    if (cmd === 'install') return install(opts, { env, out });
    if (cmd === 'uninstall') return uninstall(opts, { env, out });
    if (cmd === 'list') return listCmd(arg, { out });
    if (cmd === 'doctor') return doctor({ env, out });
    throw new Error(`Unknown command "${cmd}". Run "rounded --help".`);
  } catch (e) {
    err(`Error: ${e.message}`);
    return 1;
  }
}

module.exports = { main, parseArgs, HELP };
