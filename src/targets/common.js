'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = (env = process.env) => (env.HOME && path.isAbsolute(env.HOME) ? env.HOME : os.homedir());

/** Forward slashes, so paths embedded in commands and imports work on every platform. */
const slash = (p) => p.replace(/\\/g, '/');

/** Selected items of a catalog collection, in catalog order. */
function pick(items, ids) {
  const set = new Set(ids);
  return items.filter((i) => set.has(i.id));
}

/** File operations that copy a skill directory. */
function skillOps(skill, destRoot) {
  return skill.files.map((rel) => ({
    kind: 'file',
    dest: path.join(destRoot, skill.id, rel),
    content: fs.readFileSync(path.join(skill.dir, rel), 'utf8'),
  }));
}

/** Rules as one markdown document, for harnesses without file imports. */
function inlineRules(rules) {
  const parts = ['# Rounded rules', '', 'Engineering rules installed by Rounded. Language-specific sections apply only to matching files.', ''];
  for (const r of rules) {
    const body = r.body.trim().replace(/^# (.*)$/m, (_, t) => `## ${t}`);
    parts.push(body);
    if (r.globs) parts.push('', `_Applies to: ${r.globs.split(',').map((g) => `\`${g.trim()}\``).join(', ')}_`);
    parts.push('');
  }
  return parts.join('\n').trim();
}

/** Command text for harnesses that append the user's input themselves. */
function commandPrompt(cmd, replacement) {
  const text = cmd.body.trim().replace(/\$ARGUMENTS/g, replacement);
  if (!/\*\*[\w-]+\*\* agent|`[\w-]+` skill/.test(text)) return text;
  return `${text}\n\nWhere this mentions a Rounded agent or skill that is not available in this tool, apply the same method yourself.`;
}

module.exports = { home, slash, pick, skillOps, inlineRules, commandPrompt };
