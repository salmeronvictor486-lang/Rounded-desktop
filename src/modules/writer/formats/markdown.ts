import type { JSONContent } from '@tiptap/core';

type Mark = { type: string; attrs?: Record<string, any> };

/** Markdown en línea: **negrita**, *cursiva*, ~~tachado~~, `código`, [enlace](url). */
function parseInline(s: string): JSONContent[] {
  const out: JSONContent[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (text: string, marks?: Mark[]) => text && out.push(marks?.length ? { type: 'text', text, marks } : { type: 'text', text });
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index).replace(/\\([*_`[\]\\])/g, '$1'));
    if (m[2] || m[3]) push(m[2] ?? m[3], [{ type: 'bold' }]);
    else if (m[4] || m[5]) push(m[4] ?? m[5], [{ type: 'italic' }]);
    else if (m[6]) push(m[6], [{ type: 'strike' }]);
    else if (m[7]) push(m[7], [{ type: 'code' }]);
    else if (m[8]) {
      const href = m[9];
      if (/^(https?:|mailto:|#)/i.test(href)) push(m[8], [{ type: 'link', attrs: { href } }]);
      else push(m[8]);
    }
    last = m.index + m[0].length;
  }
  push(s.slice(last).replace(/\\([*_`[\]\\])/g, '$1'));
  return out;
}

/** Conversor Markdown → documento (subconjunto CommonMark: títulos, listas, citas, código, tablas, reglas). */
export function markdownToDoc(md: string): JSONContent {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const content: JSONContent[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = () => {
    if (para.length) content.push({ type: 'paragraph', content: parseInline(para.join(' ')) });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      flush();
      i++;
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flush();
      content.push({ type: 'heading', attrs: { level: m[1].length }, content: parseInline(m[2].replace(/\s+#+\s*$/, '')) });
      i++;
    } else if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      content.push({ type: 'codeBlock', content: code.length ? [{ type: 'text', text: code.join('\n') }] : undefined });
    } else if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      flush();
      content.push({ type: 'horizontalRule' });
      i++;
    } else if (/^>\s?/.test(line)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      content.push({ type: 'blockquote', content: (markdownToDoc(q.join('\n')).content ?? []) });
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const items: JSONContent[] = [];
      const start = ordered ? parseInt(line, 10) || 1 : 1;
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && /^\s*\d/.test(lines[i]) === ordered) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')) }] });
        i++;
      }
      content.push(ordered ? { type: 'orderedList', attrs: { start }, content: items } : { type: 'bulletList', content: items });
    } else if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const rows: string[][] = [];
      const split = (l: string) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      rows.push(split(line));
      i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(split(lines[i++]));
      content.push({
        type: 'table',
        content: rows.map((r, ri) => ({
          type: 'tableRow',
          content: r.map((c) => ({ type: ri === 0 ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: parseInline(c) }] })),
        })),
      });
    } else {
      para.push(line.trim());
      i++;
    }
  }
  flush();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
