'use strict';
/**
 * Minimal YAML front matter reader for the subset Rounded content uses:
 * `key: value` pairs with optional single or double quotes. Anything richer
 * is rejected by `scripts/validate.js` so every harness can read the files.
 */

function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\(["\\])/g, '$1') : inner.replace(/''/g, "'");
  }
  return s;
}

/** Split a markdown document into { data, body, errors }. */
function parse(text) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return { data: {}, body: src, errors: ['missing front matter'] };
  const end = src.indexOf('\n---', 4);
  if (end < 0) return { data: {}, body: src, errors: ['unterminated front matter'] };
  const head = src.slice(4, end);
  const rest = src.slice(end + 4);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;
  const data = {};
  const errors = [];
  head.split('\n').forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const m = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!m) {
      errors.push(`line ${i + 2}: expected "key: value"`);
      return;
    }
    if (m[1] in data) errors.push(`line ${i + 2}: duplicate key "${m[1]}"`);
    data[m[1]] = unquote(m[2] || '');
  });
  return { data, body, errors };
}

/** Serialise a flat object back to front matter (values quoted when needed). */
function stringify(data, body) {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const s = String(v);
      const needsQuotes = /^[\s'"[{>|*&!%@`#-]|: |\s#|^(true|false|null|yes|no|~)$/i.test(s) || /\s$/.test(s);
      return `${k}: ${needsQuotes ? JSON.stringify(s) : s}`;
    });
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

module.exports = { parse, stringify };
