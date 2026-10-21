'use strict';
/**
 * Applies install plans and records what was written so it can be upgraded or removed later.
 *
 * A plan is a list of operations produced by a target adapter (src/targets/*):
 *   { kind: 'file',  dest, content }                  write a file Rounded owns
 *   { kind: 'block', dest, content, header? }          managed section inside a shared markdown file
 *   { kind: 'claude-hooks', dest, hooks }              merge hook entries into a Claude Code settings.json
 *
 * Files the user created or edited are never overwritten or deleted without --force.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BLOCK_START = '<!-- rounded:start (managed by Rounded; edits inside this block are replaced on reinstall) -->';
const BLOCK_END = '<!-- rounded:end -->';
const HOOK_MARKER = '/rounded/hooks/scripts/';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function stateDir(env = process.env) {
  return env.ROUNDED_HOME ? path.resolve(env.ROUNDED_HOME) : path.join(os.homedir(), '.rounded');
}

function stateFile(target, scope, base, env = process.env) {
  const id = sha256(path.resolve(base)).slice(0, 12);
  return path.join(stateDir(env), 'installs', `${target}-${scope}-${id}.json`);
}

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function allStates(env = process.env) {
  const dir = path.join(stateDir(env), 'installs');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: path.join(dir, f), state: readState(path.join(dir, f)) }))
    .filter((s) => s.state);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Remove now-empty directories from `dir` upwards, stopping at `stop`. */
function pruneDirs(dir, stop) {
  let d = path.resolve(dir);
  const s = path.resolve(stop);
  while (d.startsWith(s) && d !== s) {
    try {
      if (fs.readdirSync(d).length) return;
      fs.rmdirSync(d);
    } catch {
      return;
    }
    d = path.dirname(d);
  }
}

// ---------- managed blocks ----------

function blockRegex() {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\n?${esc(BLOCK_START)}[\\s\\S]*?${esc(BLOCK_END)}\\n?`);
}

function upsertBlock(text, content) {
  const block = `${BLOCK_START}\n${content.trim()}\n${BLOCK_END}\n`;
  const re = blockRegex();
  if (text && re.test(text)) return text.replace(re, (m) => (m.startsWith('\n') ? '\n' : '') + block);
  if (!text || !text.trim()) return block;
  return `${text.replace(/\s*$/, '')}\n\n${block}`;
}

function removeBlock(text) {
  if (!text) return text;
  const out = text.replace(blockRegex(), '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
  return out ? `${out}\n` : '';
}

// ---------- Claude Code settings.json hooks ----------

function isOurHook(h) {
  return h && typeof h.command === 'string' && h.command.replace(/\\/g, '/').includes(HOOK_MARKER);
}

/** Remove Rounded's hook commands from a settings object (in place) and drop empty groups. */
function stripHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object') return settings;
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups
      .map((g) => ({ ...g, hooks: Array.isArray(g.hooks) ? g.hooks.filter((h) => !isOurHook(h)) : g.hooks }))
      .filter((g) => !Array.isArray(g.hooks) || g.hooks.length);
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  return settings;
}

function mergeHooks(settings, hooks) {
  stripHooks(settings);
  settings.hooks = settings.hooks || {};
  for (const [event, groups] of Object.entries(hooks)) {
    settings.hooks[event] = [...(settings.hooks[event] || []), ...groups];
  }
  return settings;
}

function readSettings(file) {
  const text = readText(file);
  if (text === null || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not valid JSON; fix it before installing hooks.`);
  }
}

// ---------- apply / remove ----------

/**
 * Apply a plan.
 * @returns {{ written: string[], unchanged: string[], skipped: {path, reason}[], removed: string[], statePath: string }}
 */
function apply(plan, { target, scope, base, version, dryRun = false, force = false, env = process.env, log = () => {} }) {
  const statePath = stateFile(target, scope, base, env);
  const prev = readState(statePath) || { files: [], blocks: [], settings: [] };
  const prevFiles = new Map(prev.files.map((f) => [f.path, f.sha256]));
  const report = { written: [], unchanged: [], skipped: [], removed: [], statePath };
  const next = { tool: 'rounded', version, target, scope, base: path.resolve(base), installedAt: new Date().toISOString(), files: [], blocks: [], settings: [] };

  for (const op of plan) {
    if (op.kind === 'file') {
      const current = readText(op.dest);
      const hash = sha256(op.content);
      if (current !== null && current === op.content) {
        report.unchanged.push(op.dest);
        next.files.push({ path: op.dest, sha256: hash });
        continue;
      }
      if (current !== null && !force) {
        const ours = prevFiles.get(op.dest);
        if (!ours) {
          report.skipped.push({ path: op.dest, reason: 'a file you created already exists here (use --force to overwrite)' });
          continue;
        }
        if (ours !== sha256(current)) {
          report.skipped.push({ path: op.dest, reason: 'you edited this file since it was installed (use --force to overwrite)' });
          next.files.push({ path: op.dest, sha256: ours });
          continue;
        }
      }
      if (!dryRun) writeText(op.dest, op.content);
      report.written.push(op.dest);
      next.files.push({ path: op.dest, sha256: hash });
    } else if (op.kind === 'block') {
      const current = readText(op.dest) || '';
      const updated = upsertBlock(current || (op.header ? `${op.header}\n` : ''), op.content);
      if (updated === current) report.unchanged.push(op.dest);
      else {
        if (!dryRun) writeText(op.dest, updated);
        report.written.push(op.dest);
      }
      next.blocks.push({ path: op.dest });
    } else if (op.kind === 'claude-hooks') {
      const prevEntry = prev.settings.find((x) => x.path === op.dest);
      const created = prevEntry ? !!prevEntry.created : readText(op.dest) === null;
      const settings = readSettings(op.dest);
      const before = JSON.stringify(settings);
      mergeHooks(settings, op.hooks);
      const text = `${JSON.stringify(settings, null, 2)}\n`;
      if (JSON.stringify(settings) === before) report.unchanged.push(op.dest);
      else {
        if (!dryRun) writeText(op.dest, text);
        report.written.push(op.dest);
      }
      next.settings.push({ path: op.dest, created });
    } else {
      throw new Error(`Unknown operation ${op.kind}`);
    }
  }

  // Files from a previous install that are no longer part of the selection
  const keep = new Set(next.files.map((f) => f.path));
  for (const f of prev.files) {
    if (keep.has(f.path)) continue;
    const current = readText(f.path);
    if (current === null) continue;
    if (sha256(current) !== f.sha256 && !force) {
      report.skipped.push({ path: f.path, reason: 'no longer selected, but you edited it, so it was kept' });
      continue;
    }
    if (!dryRun) {
      fs.rmSync(f.path, { force: true });
      pruneDirs(path.dirname(f.path), base);
    }
    report.removed.push(f.path);
  }
  for (const b of prev.blocks) {
    if (next.blocks.some((x) => x.path === b.path)) continue;
    if (!dryRun && !sharedElsewhere('blocks', b.path, statePath, env)) writeText(b.path, removeBlock(readText(b.path) || ''));
  }

  if (!dryRun) writeText(statePath, `${JSON.stringify(next, null, 2)}\n`);
  log(report);
  return report;
}

/** Whether another installation (another target) also uses this shared file. */
function sharedElsewhere(kind, p, ownState, env) {
  return allStates(env).some(({ file, state }) => file !== ownState && (state[kind] || []).some((x) => x.path === p));
}

function uninstall({ target, scope, base, dryRun = false, force = false, env = process.env }) {
  const statePath = stateFile(target, scope, base, env);
  const state = readState(statePath);
  if (!state) return null;
  const report = { removed: [], kept: [], statePath };
  for (const f of state.files) {
    const current = readText(f.path);
    if (current === null) continue;
    if (sha256(current) !== f.sha256 && !force) {
      report.kept.push({ path: f.path, reason: 'edited after install (use --force to delete)' });
      continue;
    }
    if (!dryRun) {
      fs.rmSync(f.path, { force: true });
      pruneDirs(path.dirname(f.path), state.base);
    }
    report.removed.push(f.path);
  }
  for (const b of state.blocks) {
    if (sharedElsewhere('blocks', b.path, statePath, env)) {
      report.kept.push({ path: b.path, reason: 'rules block still used by another Rounded installation' });
      continue;
    }
    const text = readText(b.path);
    if (text === null) continue;
    const updated = removeBlock(text);
    if (!dryRun) {
      if (updated.trim()) writeText(b.path, updated);
      else fs.rmSync(b.path, { force: true });
    }
    report.removed.push(`${b.path} (Rounded block)`);
  }
  for (const s of state.settings) {
    if (readText(s.path) === null) continue;
    const settings = readSettings(s.path);
    stripHooks(settings);
    if (!dryRun) {
      // Delete the settings file only if Rounded created it and nothing else was added since.
      if (s.created && !Object.keys(settings).length) fs.rmSync(s.path, { force: true });
      else writeText(s.path, `${JSON.stringify(settings, null, 2)}\n`);
    }
    report.removed.push(`${s.path} (Rounded hooks)`);
  }
  if (!dryRun) {
    fs.rmSync(statePath, { force: true });
    // Project installs: remove the harness folder (.claude, .cursor, ...) if Rounded left it empty.
    // Never the project folder itself (Codex installs use it as their base).
    if (state.scope === 'project' && path.basename(state.base).startsWith('.')) pruneDirs(state.base, path.dirname(state.base));
  }
  return report;
}

module.exports = {
  BLOCK_START, BLOCK_END, HOOK_MARKER, sha256, stateDir, stateFile, readState, allStates,
  upsertBlock, removeBlock, mergeHooks, stripHooks, apply, uninstall,
};
