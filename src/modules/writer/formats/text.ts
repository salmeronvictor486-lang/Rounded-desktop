import type { JSONContent } from '@tiptap/core';
import { collectHeadingsJson } from '../extensions/toc';

/** Texto plano → párrafos (las líneas en blanco separan párrafos; los saltos simples se conservan). */
export function textToDoc(text: string): JSONContent {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const content: JSONContent[] = lines.map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function inlineText(n: JSONContent): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'footnote') return `[${n.attrs?.text ?? ''}]`;
  return (n.content ?? []).map(inlineText).join('');
}

/** Documento → texto plano. */
export function docToText(doc: JSONContent): string {
  const out: string[] = [];
  const walk = (n: JSONContent, prefix = '') => {
    switch (n.type) {
      case 'doc':
        n.content?.forEach((c) => walk(c));
        break;
      case 'paragraph':
      case 'heading':
        out.push(prefix + inlineText(n));
        break;
      case 'bulletList':
        n.content?.forEach((li) => li.content?.forEach((c, i) => walk(c, i === 0 ? `${prefix}• ` : `${prefix}  `)));
        break;
      case 'orderedList': {
        let k = Number(n.attrs?.start ?? 1);
        n.content?.forEach((li) => {
          li.content?.forEach((c, i) => walk(c, i === 0 ? `${prefix}${k}. ` : `${prefix}   `));
          k++;
        });
        break;
      }
      case 'blockquote':
        n.content?.forEach((c) => walk(c, `${prefix}> `));
        break;
      case 'codeBlock':
        out.push(inlineText(n));
        break;
      case 'table':
        n.content?.forEach((row) => out.push(row.content?.map((cell) => (cell.content ?? []).map(inlineText).join(' ')).join('\t') ?? ''));
        break;
      case 'horizontalRule':
        out.push('————————');
        break;
      case 'pageBreak':
        out.push('\f');
        break;
      case 'tableOfContents':
        collectHeadingsJson(doc, 3).forEach((h) => out.push(`${'  '.repeat(h.level - 1)}${h.text}`));
        break;
      default:
        n.content?.forEach((c) => walk(c, prefix));
    }
  };
  walk(doc);
  return out.join('\n');
}

function mdInline(n: JSONContent): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'footnote') return `^[${n.attrs?.text ?? ''}]`;
  if (n.type !== 'text') return (n.content ?? []).map(mdInline).join('');
  let s = (n.text ?? '').replace(/([*_`[\]\\])/g, '\\$1');
  const marks = n.marks ?? [];
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has('code')) s = '`' + n.text + '`';
  if (has('bold')) s = `**${s}**`;
  if (has('italic')) s = `*${s}*`;
  if (has('strike')) s = `~~${s}~~`;
  const link = marks.find((m) => m.type === 'link');
  if (link) s = `[${s}](${link.attrs?.href ?? ''})`;
  return s;
}

/** Documento → Markdown (exportación). */
export function docToMarkdown(doc: JSONContent): string {
  const blocks: string[] = [];
  const walk = (n: JSONContent, indent = ''): string[] => {
    switch (n.type) {
      case 'paragraph':
        return [indent + (n.content ?? []).map(mdInline).join('')];
      case 'heading':
        return ['#'.repeat(Number(n.attrs?.level ?? 1)) + ' ' + (n.content ?? []).map(mdInline).join('')];
      case 'bulletList':
      case 'orderedList': {
        const lines: string[] = [];
        let k = Number(n.attrs?.start ?? 1);
        for (const li of n.content ?? []) {
          const marker = n.type === 'bulletList' ? '- ' : `${k++}. `;
          (li.content ?? []).forEach((c, i) => {
            const sub = walk(c, indent + (i === 0 ? '' : '   '));
            if (i === 0 && c.type === 'paragraph') lines.push(indent + marker + sub[0].slice(indent.length), ...sub.slice(1));
            else lines.push(...walk(c, indent + '   '));
          });
        }
        return lines;
      }
      case 'blockquote':
        return (n.content ?? []).flatMap((c) => walk(c)).map((l) => `> ${l}`);
      case 'codeBlock':
        return ['```', (n.content ?? []).map((c) => c.text ?? '').join(''), '```'];
      case 'horizontalRule':
        return ['---'];
      case 'pageBreak':
        return ['<div style="page-break-after: always"></div>'];
      case 'image':
        return [`![${n.attrs?.alt ?? ''}](${String(n.attrs?.src ?? '').startsWith('data:') ? 'imagen-incrustada' : n.attrs?.src})`];
      case 'table': {
        const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((pp) => (pp.content ?? []).map(mdInline).join('')).join(' ').replace(/\|/g, '\\|')));
        if (!rows.length) return [];
        const cols = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`;
        return [line(rows[0]), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line)];
      }
      case 'tableOfContents':
        return collectHeadingsJson(doc, 3).map((h) => `${'  '.repeat(h.level - 1)}- ${h.text}`);
      default:
        return (n.content ?? []).flatMap((c) => walk(c, indent));
    }
  };
  for (const n of doc.content ?? []) blocks.push(walk(n).join('\n'));
  return blocks.join('\n\n') + '\n';
}
