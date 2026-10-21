'use strict';
/** Project facts and session snapshots shared by the session hooks. */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, maxBuffer: 4 * 1024 * 1024 }).trimEnd();
  } catch {
    return null;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Current branch name, also for a new repository without commits; null when detached or not a repository. */
function branch(cwd) {
  return git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']) || null;
}

/** Detect the stack and the commands a contributor would run. */
function describe(cwd) {
  const has = (f) => fs.existsSync(path.join(cwd, f));
  const facts = { name: path.basename(cwd), stack: [], commands: {} };
  const pkg = readJson(path.join(cwd, 'package.json'));
  if (pkg) {
    if (pkg.name) facts.name = pkg.name;
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm';
    facts.stack.push(has('tsconfig.json') ? `TypeScript (${pm})` : `JavaScript (${pm})`);
    for (const s of ['dev', 'build', 'test', 'lint', 'typecheck', 'format']) {
      if (pkg.scripts && pkg.scripts[s]) facts.commands[s] = `${pm} ${pm === 'npm' && s !== 'test' ? 'run ' : ''}${s}`;
    }
  }
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) facts.stack.push(has('uv.lock') ? 'Python (uv)' : has('poetry.lock') ? 'Python (poetry)' : 'Python');
  if (has('Cargo.toml')) {
    facts.stack.push('Rust');
    facts.commands.test = facts.commands.test || 'cargo test';
  }
  if (has('go.mod')) {
    facts.stack.push('Go');
    facts.commands.test = facts.commands.test || 'go test ./...';
  }
  if (has('pom.xml')) facts.stack.push('Java (Maven)');
  if (has('build.gradle') || has('build.gradle.kts')) facts.stack.push('JVM (Gradle)');
  if (has('Gemfile')) facts.stack.push('Ruby');
  if (has('composer.json')) facts.stack.push('PHP');
  if (has('mix.exs')) facts.stack.push('Elixir');
  if (has('pubspec.yaml')) facts.stack.push('Dart/Flutter');
  if (has('Package.swift')) facts.stack.push('Swift');
  if (has('Makefile')) facts.commands.make = 'make';
  return facts;
}

function stateDir(env = process.env) {
  return env.ROUNDED_HOME ? path.resolve(env.ROUNDED_HOME) : path.join(os.homedir(), '.rounded');
}

function sessionFile(cwd, env = process.env) {
  const id = crypto.createHash('sha1').update(path.resolve(cwd)).digest('hex').slice(0, 12);
  return path.join(stateDir(env), 'sessions', `${id}.md`);
}

/** Last user prompts from a Claude Code transcript (JSONL), newest last. */
function recentPrompts(transcriptPath, max = 5) {
  if (!transcriptPath) return [];
  let text;
  try {
    const stat = fs.statSync(transcriptPath);
    // Only the tail matters; avoid reading huge transcripts entirely.
    const fd = fs.openSync(transcriptPath, 'r');
    const size = Math.min(stat.size, 2 * 1024 * 1024);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, stat.size - size);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch {
    return [];
  }
  const prompts = [];
  for (const line of text.split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || entry.type !== 'user' || !entry.message) continue;
    const c = entry.message.content;
    const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join('\n') : '';
    // Skip tool results and harness-injected reminders
    if (!t.trim() || /^<(system-reminder|command-|local-command)/.test(t.trim())) continue;
    prompts.push(t.trim().replace(/\s+/g, ' ').slice(0, 300));
  }
  return prompts.slice(-max);
}

module.exports = { git, branch, describe, stateDir, sessionFile, recentPrompts };
