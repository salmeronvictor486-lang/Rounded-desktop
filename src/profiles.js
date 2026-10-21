'use strict';
/** Install profiles and language detection. */
const fs = require('fs');
const path = require('path');

const CORE = {
  agents: ['planner', 'code-reviewer', 'security-reviewer', 'tdd-guide', 'build-fixer', 'debugger'],
  skills: ['tdd-workflow', 'code-review', 'security-review', 'systematic-debugging', 'git-workflow', 'writing-tests', 'context-management'],
  commands: ['plan', 'tdd', 'review', 'verify', 'fix-build', 'debug', 'checkpoint', 'resume', 'commit'],
};

/** Skills that only make sense for a given language (installed when the language is selected). */
const LANGUAGE_SKILLS = {
  typescript: ['typescript-patterns'],
  python: ['python-patterns'],
  go: ['go-patterns'],
  rust: ['rust-patterns'],
};

const PROFILES = ['core', 'full'];

/** Languages used by the project in `dir`, from its manifest files. */
function detectLanguages(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  const langs = [];
  if (has('package.json') || has('tsconfig.json') || has('deno.json')) langs.push('typescript');
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py') || has('Pipfile')) langs.push('python');
  if (has('go.mod')) langs.push('go');
  if (has('Cargo.toml')) langs.push('rust');
  return langs;
}

function usesReact(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return !!({ ...pkg.dependencies, ...pkg.devDependencies }.react);
  } catch {
    return false;
  }
}

/**
 * Resolve what to install.
 * @returns {{ agents: string[], skills: string[], commands: string[], ruleGroups: string[], hooks: boolean }}
 */
function select(catalog, { profile = 'core', languages, dir, only, hooks = true }) {
  if (!PROFILES.includes(profile)) throw new Error(`Unknown profile "${profile}". Use one of: ${PROFILES.join(', ')}.`);
  const langs = languages || catalog.languages;
  for (const l of langs) if (!catalog.languages.includes(l)) throw new Error(`Unknown language "${l}". Available: ${catalog.languages.join(', ')}.`);
  let sel;
  if (profile === 'full') {
    sel = { agents: catalog.agents.map((a) => a.id), skills: catalog.skills.map((s) => s.id), commands: catalog.commands.map((c) => c.id) };
  } else {
    const skills = [...CORE.skills];
    for (const l of langs) skills.push(...(LANGUAGE_SKILLS[l] || []));
    if (dir && usesReact(dir)) skills.push('react-patterns', 'frontend-accessibility');
    sel = { agents: [...CORE.agents], skills: [...new Set(skills)], commands: [...CORE.commands] };
  }
  const out = { ...sel, ruleGroups: ['common', ...langs], hooks };
  if (only) {
    const keep = new Set(only);
    if (!keep.has('agents')) out.agents = [];
    if (!keep.has('skills')) out.skills = [];
    if (!keep.has('commands')) out.commands = [];
    if (!keep.has('rules')) out.ruleGroups = [];
    if (!keep.has('hooks')) out.hooks = false;
  }
  return out;
}

module.exports = { CORE, LANGUAGE_SKILLS, PROFILES, detectLanguages, select };
