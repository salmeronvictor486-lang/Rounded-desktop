import { generateJSON, getHTMLFromFragment, getSchema, type JSONContent } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import DOMPurify from 'dompurify';
import { escapeHtml } from '@/core/util/escape';
import { schemaExtensions } from '../extensions';
import { collectHeadingsJson } from '../extensions/toc';
import type { WriterContent } from '../model';

let schemaCache: ReturnType<typeof getSchema> | null = null;
export function writerSchema() {
  if (!schemaCache) schemaCache = getSchema(schemaExtensions());
  return schemaCache;
}

/** Convierte JSON a nodo ProseMirror validando contra el esquema. */
export function jsonToNode(doc: JSONContent): PMNode {
  const node = PMNode.fromJSON(writerSchema(), doc);
  node.check();
  return node;
}

/** HTML del cuerpo del documento (sin envoltorio). Índice y notas se materializan. */
export function docBodyHtml(doc: JSONContent): string {
  const node = jsonToNode(doc);
  let html = getHTMLFromFragment(node.content, writerSchema());
  // Índice estático
  const headings = collectHeadingsJson(doc, 3);
  html = html.replace(/<nav([^>]*)data-toc=""([^>]*)><\/nav>/g, (_m, a, b) => {
    const attrs = `${a}${b}`;
    const title = /data-title="([^"]*)"/.exec(attrs)?.[1] ?? 'Índice';
    const items = headings.map((h) => `<li class="toc-level-${h.level}"><a href="#h-${h.index}">${escapeHtml(h.text)}</a></li>`).join('');
    return `<nav class="toc" data-toc=""><div class="toc-title">${title}</div><ol>${items}</ol></nav>`;
  });
  // Anclas de títulos para los enlaces del índice
  let hIndex = 0;
  html = html.replace(/<h([1-6])(\s|>)/g, (_m, lvl, after) => `<h${lvl} id="h-${hIndex++}"${after}`);
  // Notas al pie numeradas
  let n = 0;
  const notes: { kind: string; text: string }[] = [];
  html = html.replace(/<sup([^>]*)data-footnote="([^"]*)"([^>]*)><\/sup>/g, (_m, a, text, b) => {
    const kind = /data-kind="endnote"/.test(a + b) ? 'endnote' : 'footnote';
    notes.push({ kind, text });
    n++;
    return `<sup class="footnote-ref" id="fnref-${n}"><a href="#fn-${n}">${n}</a></sup>`;
  });
  if (notes.length) {
    html += `<section class="footnotes"><hr><ol>${notes.map((x, i) => `<li id="fn-${i + 1}">${x.text} <a href="#fnref-${i + 1}" aria-label="Volver">↩</a></li>`).join('')}</ol></section>`;
  }
  return html;
}

export const DOCUMENT_CSS = `
body { font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.15; color: #111; }
p { margin: 0 0 8pt; }
h1 { font-size: 20pt; margin: 18pt 0 6pt; } h2 { font-size: 16pt; margin: 14pt 0 4pt; } h3 { font-size: 13pt; margin: 12pt 0 4pt; }
h4, h5, h6 { font-size: 11pt; margin: 10pt 0 4pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
td, th { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
th { background: #f2f2f2; font-weight: bold; }
td p, th p { margin: 0; }
img { max-width: 100%; height: auto; }
img[data-align="center"] { display: block; margin: 0 auto; }
img[data-align="right"] { display: block; margin-left: auto; }
blockquote { margin: 8pt 0 8pt 0; padding-left: 12pt; border-left: 3px solid #ccc; color: #444; }
pre { background: #f5f5f5; padding: 8pt; font-family: Consolas, monospace; font-size: 10pt; white-space: pre-wrap; }
.page-break { break-after: page; page-break-after: always; height: 0; }
.toc ol { list-style: none; padding: 0; } .toc .toc-title { font-size: 14pt; font-weight: bold; margin-bottom: 6pt; }
.toc-level-2 { padding-left: 18pt; } .toc-level-3 { padding-left: 36pt; }
.toc a { color: inherit; text-decoration: none; }
.footnotes { font-size: 9pt; margin-top: 24pt; }
ol ol { list-style-type: lower-alpha; } ol ol ol { list-style-type: lower-roman; }
mark { padding: 0 1px; }
`;

/** Documento HTML independiente (exportación). */
export function writerToHtml(content: WriterContent, title: string): string {
  return `<!doctype html>
<html lang="${content.language ?? 'es'}">
<head>
<meta charset="utf-8">
<meta name="generator" content="Rounded Scribe">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
${docBodyHtml(content.doc)}
</body>
</html>`;
}

/** Sanitiza HTML externo (pegado o importado). */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: true,
  });
}

/** HTML externo → JSON del documento, filtrado por el esquema. */
export function htmlToDoc(html: string): JSONContent {
  const clean = sanitizeHtml(html);
  return generateJSON(clean, schemaExtensions());
}
