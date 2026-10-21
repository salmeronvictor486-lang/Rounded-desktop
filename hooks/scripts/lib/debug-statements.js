'use strict';
/** Leftover debugging statements by language. Matched only against newly written text. */
const path = require('path');

const RULES = [
  { exts: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts', 'vue', 'svelte', 'astro'], res: [/\bconsole\.(log|debug|trace|dir)\s*\(/, /^\s*debugger\s*;?\s*$/] },
  { exts: ['py'], res: [/^\s*breakpoint\(\s*\)/, /^\s*import\s+i?pdb\b/, /\bi?pdb\.set_trace\(/] },
  { exts: ['rb'], res: [/\bbinding\.(pry|irb)\b/, /^\s*byebug\b/] },
  { exts: ['rs'], res: [/\bdbg!\s*\(/] },
  { exts: ['php'], res: [/\b(var_dump|print_r|dd|dump)\s*\(/] },
  { exts: ['java', 'kt'], res: [/\.printStackTrace\(\s*\)/] },
  { exts: ['ex', 'exs'], res: [/\bIO\.inspect\b/, /\bIEx\.pry\b/] },
  { exts: ['swift'], res: [/^\s*debugPrint\(/] },
];

/** Paths where printing is the point (CLIs, scripts, examples) or expected (tests). */
const EXEMPT = /(^|\/)(bin|scripts?|cli|tools|examples?|demo|__tests__|tests?|spec|e2e|benchmarks?)\/|\.(test|spec|bench|stories)\.[a-z]+$|(^|\/)(conftest|test_[^/]+)\.py$/;

function find(file, text) {
  if (!file || typeof text !== 'string') return [];
  const norm = file.replace(/\\/g, '/');
  if (EXEMPT.test(norm)) return [];
  const ext = path.extname(norm).slice(1).toLowerCase();
  const rule = RULES.find((r) => r.exts.includes(ext));
  if (!rule) return [];
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|#|\*|--)/.test(line)) return;
    if (rule.res.some((re) => re.test(line))) hits.push({ line: i + 1, text: line.trim().slice(0, 120) });
  });
  return hits;
}

module.exports = { find };
