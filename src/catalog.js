'use strict';
/** Loads the agents, skills, commands, rules and hooks shipped in this repository. */
const fs = require('fs');
const path = require('path');
const fm = require('./frontmatter');

const ROOT = path.resolve(__dirname, '..');

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}

function readDoc(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { raw, ...fm.parse(raw) };
}

function load(root = ROOT) {
  const agents = listFiles(path.join(root, 'agents'))
    .filter((f) => f.endsWith('.md') && path.basename(f) !== 'README.md')
    .map((file) => {
      const d = readDoc(file);
      return { kind: 'agent', id: path.basename(file, '.md'), file, ...d, name: d.data.name, description: d.data.description, tools: d.data.tools };
    });

  const skillsDir = path.join(root, 'skills');
  const skills = (fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir, { withFileTypes: true }) : [])
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(skillsDir, e.name);
      const file = path.join(dir, 'SKILL.md');
      const d = fs.existsSync(file) ? readDoc(file) : { raw: '', data: {}, body: '', errors: ['missing SKILL.md'] };
      return {
        kind: 'skill', id: e.name, dir, file, ...d, name: d.data.name, description: d.data.description,
        files: listFiles(dir).map((f) => path.relative(dir, f)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const commands = listFiles(path.join(root, 'commands'))
    .filter((f) => f.endsWith('.md') && path.basename(f) !== 'README.md')
    .map((file) => {
      const d = readDoc(file);
      return { kind: 'command', id: path.basename(file, '.md'), file, ...d, description: d.data.description, argumentHint: d.data['argument-hint'] };
    });

  const rulesDir = path.join(root, 'rules');
  const rules = listFiles(rulesDir)
    .filter((f) => f.endsWith('.md') && path.basename(f) !== 'README.md')
    .map((file) => {
      const rel = path.relative(rulesDir, file).split(path.sep);
      const d = readDoc(file);
      return { kind: 'rule', group: rel[0], id: path.basename(file, '.md'), file, ...d, description: d.data.description, globs: d.data.globs };
    });

  const hooksFile = path.join(root, 'hooks', 'hooks.json');
  const hooks = fs.existsSync(hooksFile) ? JSON.parse(fs.readFileSync(hooksFile, 'utf8')) : null;
  const hookScripts = listFiles(path.join(root, 'hooks', 'scripts')).map((f) => path.relative(path.join(root, 'hooks', 'scripts'), f));

  const languages = [...new Set(rules.map((r) => r.group).filter((g) => g !== 'common'))].sort();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  return { root, version, agents, skills, commands, rules, hooks, hookScripts, languages };
}

module.exports = { ROOT, load, listFiles };
