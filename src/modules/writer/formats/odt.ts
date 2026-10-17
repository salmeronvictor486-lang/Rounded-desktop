import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';
import { inspectZip } from '@/core/files/zipGuard';
import { FileFormatError } from '@/core/files/errors';
import { attr, child, children, descendants, parseXml } from '@/core/files/xml';
import { bytesToBase64, dataUrlToBytes, mimeFromExtension } from '@/core/files/download';
import { escapeXml } from '@/core/util/escape';
import { toHex6 } from '@/core/util/color';
import { imageSize } from '@/core/util/imageSize';
import { BRAND } from '@/config/brand';
import { INDENT_STEP_PX } from '../extensions/paragraphFormat';
import { collectHeadingsJson } from '../extensions/toc';
import { createEmptyDocument, normalizeWriterContent, pageDimensions, type PaperSize, type WriterContent } from '../model';

type Mark = { type: string; attrs?: Record<string, any> };

// ======================= EXPORTACIÓN =======================

class StyleRegistry {
  private text = new Map<string, string>();
  private para = new Map<string, string>();
  xml: string[] = [];

  textStyle(marks: Mark[]): string | null {
    const props: string[] = [];
    for (const m of marks) {
      if (m.type === 'bold') props.push('fo:font-weight="bold"');
      if (m.type === 'italic') props.push('fo:font-style="italic"');
      if (m.type === 'underline') props.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
      if (m.type === 'strike') props.push('style:text-line-through-style="solid"');
      if (m.type === 'superscript') props.push('style:text-position="super 58%"');
      if (m.type === 'subscript') props.push('style:text-position="sub 58%"');
      if (m.type === 'code') props.push('style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\'"');
      if (m.type === 'textStyle') {
        const c = toHex6(m.attrs?.color);
        if (c) props.push(`fo:color="#${c}"`);
        const size = parseFloat(String(m.attrs?.fontSize ?? ''));
        if (size) props.push(`fo:font-size="${String(m.attrs?.fontSize).endsWith('px') ? (size * 0.75).toFixed(1) : size}pt"`);
        if (m.attrs?.fontFamily) props.push(`fo:font-family="${escapeXml(String(m.attrs.fontFamily).split(',')[0].replace(/["']/g, ''))}"`);
        const bg = toHex6(m.attrs?.backgroundColor);
        if (bg) props.push(`fo:background-color="#${bg}"`);
      }
      if (m.type === 'highlight') {
        const c = toHex6(m.attrs?.color) ?? 'FFFF00';
        props.push(`fo:background-color="#${c}"`);
      }
    }
    if (!props.length) return null;
    const key = props.sort().join(' ');
    let name = this.text.get(key);
    if (!name) {
      name = `T${this.text.size + 1}`;
      this.text.set(key, name);
      this.xml.push(`<style:style style:name="${name}" style:family="text"><style:text-properties ${key}/></style:style>`);
    }
    return name;
  }

  paraStyle(attrs: Record<string, any> = {}, parent: string, extra = ''): string {
    const props: string[] = [];
    if (attrs.textAlign) props.push(`fo:text-align="${attrs.textAlign === 'left' ? 'start' : attrs.textAlign === 'right' ? 'end' : attrs.textAlign}"`);
    if (attrs.indent) props.push(`fo:margin-left="${((attrs.indent * INDENT_STEP_PX) / 96 * 2.54).toFixed(2)}cm"`);
    if (attrs.firstLineIndent) props.push(`fo:text-indent="${(attrs.firstLineIndent / 96 * 2.54).toFixed(2)}cm"`);
    if (attrs.lineHeight) props.push(`fo:line-height="${Math.round(attrs.lineHeight * 100)}%"`);
    if (attrs.spaceBefore != null) props.push(`fo:margin-top="${attrs.spaceBefore}pt"`);
    if (attrs.spaceAfter != null) props.push(`fo:margin-bottom="${attrs.spaceAfter}pt"`);
    if (extra) props.push(extra);
    if (!props.length) return parent;
    const key = `${parent}|${props.sort().join(' ')}`;
    let name = this.para.get(key);
    if (!name) {
      name = `P${this.para.size + 1}`;
      this.para.set(key, name);
      this.xml.push(`<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties ${props.join(' ')}/></style:style>`);
    }
    return name;
  }
}

interface OdtCtx {
  styles: StyleRegistry;
  images: { path: string; bytes: Uint8Array; mime: string }[];
  breakNext: boolean;
  doc: JSONContent;
  headingIndex: number;
}

function inlineXml(nodes: JSONContent[] = [], ctx: OdtCtx): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') {
      const marks = (n.marks ?? []) as Mark[];
      let text = escapeXml(n.text ?? '')
        .replace(/\t/g, '<text:tab/>')
        .replace(/ {2,}/g, (s) => ` <text:s text:c="${s.length - 1}"/>`);
      const style = ctx.styles.textStyle(marks.filter((m) => m.type !== 'link'));
      if (style) text = `<text:span text:style-name="${style}">${text}</text:span>`;
      const link = marks.find((m) => m.type === 'link');
      if (link) text = `<text:a xlink:type="simple" xlink:href="${escapeXml(String(link.attrs?.href ?? ''))}">${text}</text:a>`;
      out += text;
    } else if (n.type === 'hardBreak') {
      out += '<text:line-break/>';
    } else if (n.type === 'footnote') {
      const cls = n.attrs?.kind === 'endnote' ? 'endnote' : 'footnote';
      out += `<text:note text:note-class="${cls}"><text:note-citation>*</text:note-citation><text:note-body><text:p text:style-name="${cls === 'endnote' ? 'Endnote' : 'Footnote'}">${escapeXml(String(n.attrs?.text ?? ''))}</text:p></text:note-body></text:note>`;
    } else if (n.type === 'image') {
      out += imageXml(n, ctx);
    }
  }
  return out;
}

function imageXml(n: JSONContent, ctx: OdtCtx): string {
  const src = String(n.attrs?.src ?? '');
  if (!src.startsWith('data:')) return '';
  const { bytes, mime } = dataUrlToBytes(src);
  const size = imageSize(bytes);
  if (!size) return '';
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'png';
  const path = `Pictures/img${ctx.images.length + 1}.${ext}`;
  ctx.images.push({ path, bytes, mime });
  const w = Math.min(Number(n.attrs?.width) || size.width, 640);
  const h = (w * size.height) / Math.max(1, size.width);
  const cm = (px: number) => `${((px / 96) * 2.54).toFixed(3)}cm`;
  return `<draw:frame draw:name="Imagen${ctx.images.length}" text:anchor-type="as-char" svg:width="${cm(w)}" svg:height="${cm(h)}"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${n.attrs?.alt ? `<svg:desc>${escapeXml(n.attrs.alt)}</svg:desc>` : ''}</draw:frame>`;
}

function blocksXml(nodes: JSONContent[] = [], ctx: OdtCtx): string {
  let out = '';
  const takeBreak = () => {
    const b = ctx.breakNext;
    ctx.breakNext = false;
    return b ? 'fo:break-before="page"' : '';
  };
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        out += `<text:p text:style-name="${ctx.styles.paraStyle(n.attrs, 'Standard', takeBreak())}">${inlineXml(n.content, ctx)}</text:p>`;
        break;
      case 'heading': {
        const lvl = Number(n.attrs?.level ?? 1);
        ctx.headingIndex++;
        out += `<text:h text:style-name="${ctx.styles.paraStyle(n.attrs, `Heading_20_${lvl}`, takeBreak())}" text:outline-level="${lvl}">${inlineXml(n.content, ctx)}</text:h>`;
        break;
      }
      case 'bulletList':
      case 'orderedList':
        out += `<text:list text:style-name="${n.type === 'orderedList' ? 'LNum' : 'LBul'}">`;
        for (const li of n.content ?? []) out += `<text:list-item>${blocksXml(li.content, ctx)}</text:list-item>`;
        out += '</text:list>';
        break;
      case 'blockquote':
        out += blocksXml(
          (n.content ?? []).map((c) => ({ ...c, attrs: { ...(c.attrs ?? {}), indent: 1 } })),
          ctx,
        );
        break;
      case 'codeBlock':
        for (const line of (n.content ?? []).map((c) => c.text ?? '').join('').split('\n')) {
          out += `<text:p text:style-name="Preformatted_20_Text">${escapeXml(line)}</text:p>`;
        }
        break;
      case 'horizontalRule':
        out += '<text:p text:style-name="Horizontal_20_Line"/>';
        break;
      case 'pageBreak':
        ctx.breakNext = true;
        break;
      case 'image':
        out += `<text:p text:style-name="${ctx.styles.paraStyle({ textAlign: n.attrs?.align ?? 'left' }, 'Standard', takeBreak())}">${imageXml(n, ctx)}</text:p>`;
        break;
      case 'tableOfContents':
        out += `<text:p text:style-name="Contents_20_Heading">${escapeXml(String(n.attrs?.title ?? 'Índice'))}</text:p>`;
        for (const e of collectHeadingsJson(ctx.doc, Number(n.attrs?.maxLevel ?? 3))) {
          out += `<text:p text:style-name="Contents_20_${e.level}">${escapeXml(e.text)}</text:p>`;
        }
        break;
      case 'table': {
        const cols = Math.max(...(n.content ?? []).map((r) => (r.content ?? []).reduce((a, c) => a + Number(c.attrs?.colspan ?? 1), 0)), 1);
        out += `<table:table table:style-name="Tbl"><table:table-column table:number-columns-repeated="${cols}"/>`;
        for (const r of n.content ?? []) {
          out += '<table:table-row>';
          for (const c of r.content ?? []) {
            const cs = Number(c.attrs?.colspan ?? 1);
            const rs = Number(c.attrs?.rowspan ?? 1);
            out += `<table:table-cell table:style-name="Cell" office:value-type="string"${cs > 1 ? ` table:number-columns-spanned="${cs}"` : ''}${rs > 1 ? ` table:number-rows-spanned="${rs}"` : ''}>${blocksXml(c.content, ctx)}</table:table-cell>`;
            for (let i = 1; i < cs; i++) out += '<table:covered-table-cell/>';
          }
          out += '</table:table-row>';
        }
        out += '</table:table>';
        break;
      }
      default:
        out += blocksXml(n.content, ctx);
    }
  }
  return out;
}

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" office:version="1.3"';

function listStyles(): string {
  const bullets = ['•', '◦', '▪'];
  let bul = '<text:list-style style:name="LBul">';
  let num = '<text:list-style style:name="LNum">';
  const fmts = ['1', 'a', 'i'];
  for (let i = 1; i <= 10; i++) {
    const indent = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.635 * i + 0.635).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * i + 0.635).toFixed(3)}cm"/></style:list-level-properties>`;
    bul += `<text:list-level-style-bullet text:level="${i}" text:bullet-char="${bullets[(i - 1) % 3]}">${indent}</text:list-level-style-bullet>`;
    num += `<text:list-level-style-number text:level="${i}" style:num-suffix="." style:num-format="${fmts[(i - 1) % 3]}">${indent}</text:list-level-style-number>`;
  }
  return bul + '</text:list-style>' + num + '</text:list-style>';
}

export async function exportOdt(input: WriterContent, title = 'Documento'): Promise<Blob> {
  const content = normalizeWriterContent(input);
  const ctx: OdtCtx = { styles: new StyleRegistry(), images: [], breakNext: false, doc: content.doc, headingIndex: 0 };
  const body = blocksXml(content.doc.content, ctx);
  const page = content.page;
  const dims = pageDimensions(page);
  const mm = (v: number) => `${v}mm`;
  const body0 = content.styles?.body;
  const headerXml = (hf: { text: string; align: string }) =>
    `<text:p text:style-name="${hf.align === 'left' ? 'HFLeft' : hf.align === 'right' ? 'HFRight' : 'HFCenter'}">${escapeXml(hf.text)
      .replace(/\{page\}/g, '<text:page-number text:select-page="current">1</text:page-number>')
      .replace(/\{pages\}/g, '<text:page-count>1</text:page-count>')}</text:p>`;

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}>
<office:automatic-styles>${ctx.styles.xml.join('')}<style:style style:name="Tbl" style:family="table"><style:table-properties table:border-model="collapsing" style:width="${dims.width - page.margins.left - page.margins.right}mm"/></style:style><style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #999999"/></style:style></office:automatic-styles>
<office:body><office:text>${body || '<text:p/>'}</office:text></office:body>
</office:document-content>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS}>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="${body0?.spaceAfter ?? 8}pt" fo:line-height="${Math.round((body0?.lineHeight ?? 1.15) * 100)}%"/><style:text-properties fo:font-family="${escapeXml(body0?.fontFamily ?? 'Carlito')}" fo:font-size="${body0?.fontSize ?? 11}pt"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
${[1, 2, 3, 4, 5, 6]
  .map((l) => {
    const def = content.styles?.headings?.[l as 1];
    const size = def?.fontSize ?? [20, 16, 13, 12, 11, 11][l - 1];
    return `<style:style style:name="Heading_20_${l}" style:display-name="Heading ${l}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="${l}" style:class="text"><style:paragraph-properties fo:margin-top="${l <= 2 ? 18 : 12}pt" fo:margin-bottom="6pt" fo:keep-with-next="always"/><style:text-properties fo:font-size="${size}pt" fo:font-weight="${def?.bold === false ? 'normal' : 'bold'}"${def?.color ? ` fo:color="${def.color}"` : ''}${def?.fontFamily ? ` fo:font-family="${escapeXml(def.fontFamily)}"` : ''}/></style:style>`;
  })
  .join('')}
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0pt"/><style:text-properties fo:font-family="'Liberation Mono'" fo:font-size="10pt"/></style:style>
<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph"><style:paragraph-properties fo:border-bottom="0.5pt solid #999999"/></style:style>
<style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/></style:style>
${[1, 2, 3].map((l) => `<style:style style:name="Contents_20_${l}" style:display-name="Contents ${l}" style:family="paragraph"><style:paragraph-properties fo:margin-left="${(l - 1) * 0.5}cm"/></style:style>`).join('')}
<style:style style:name="Footnote" style:family="paragraph"><style:text-properties fo:font-size="9pt"/></style:style>
<style:style style:name="Endnote" style:family="paragraph"><style:text-properties fo:font-size="9pt"/></style:style>
<style:style style:name="HFLeft" style:family="paragraph"><style:paragraph-properties fo:text-align="start"/><style:text-properties fo:font-size="9pt" fo:color="#666666"/></style:style>
<style:style style:name="HFCenter" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" fo:color="#666666"/></style:style>
<style:style style:name="HFRight" style:family="paragraph"><style:paragraph-properties fo:text-align="end"/><style:text-properties fo:font-size="9pt" fo:color="#666666"/></style:style>
${listStyles()}
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="PL1"><style:page-layout-properties fo:page-width="${mm(dims.width)}" fo:page-height="${mm(dims.height)}" style:print-orientation="${page.orientation}" fo:margin-top="${mm(page.margins.top)}" fo:margin-bottom="${mm(page.margins.bottom)}" fo:margin-left="${mm(page.margins.left)}" fo:margin-right="${mm(page.margins.right)}">${page.columns > 1 ? `<style:columns fo:column-count="${page.columns}" fo:column-gap="${mm(page.columnGap)}"/>` : ''}</style:page-layout-properties></style:page-layout>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PL1">${page.header.text ? `<style:header>${headerXml(page.header)}</style:header>` : ''}${page.footer.text ? `<style:footer>${headerXml(page.footer)}</style:footer>` : ''}</style:master-page></office:master-styles>
</office:document-styles>`;

  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS}><office:meta><meta:generator>${BRAND.apps.document.name}</meta:generator><dc:title>${escapeXml(title)}</dc:title><dc:date>${new Date().toISOString()}</dc:date></office:meta></office:document-meta>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
${ctx.images.map((i) => `<manifest:file-entry manifest:full-path="${i.path}" manifest:media-type="${i.mime}"/>`).join('\n')}
</manifest:manifest>`;

  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', contentXml);
  zip.file('styles.xml', stylesXml);
  zip.file('meta.xml', metaXml);
  zip.file('META-INF/manifest.xml', manifest);
  for (const img of ctx.images) zip.file(img.path, img.bytes);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text', compression: 'DEFLATE' });
}

// ======================= IMPORTACIÓN =======================

interface OdfStyles {
  text: Map<string, Mark[]>;
  para: Map<string, { attrs: Record<string, any>; marks: Mark[]; breakBefore: boolean; heading?: number }>;
  lists: Map<string, { ordered: boolean[] }>;
}

function cssLengthToPx(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (v.endsWith('cm')) return (n / 2.54) * 96;
  if (v.endsWith('mm')) return (n / 25.4) * 96;
  if (v.endsWith('in')) return n * 96;
  if (v.endsWith('pt')) return (n * 96) / 72;
  return n;
}

function textPropsToMarks(tp: Element | null): Mark[] {
  if (!tp) return [];
  const marks: Mark[] = [];
  if (attr(tp, 'font-weight') === 'bold' || Number(attr(tp, 'font-weight')) >= 600) marks.push({ type: 'bold' });
  if (attr(tp, 'font-style') === 'italic') marks.push({ type: 'italic' });
  const ul = attr(tp, 'text-underline-style');
  if (ul && ul !== 'none') marks.push({ type: 'underline' });
  const lt = attr(tp, 'text-line-through-style');
  if (lt && lt !== 'none') marks.push({ type: 'strike' });
  const pos = attr(tp, 'text-position') ?? '';
  if (pos.startsWith('super') || /^\d/.test(pos) && parseFloat(pos) > 0) marks.push({ type: 'superscript' });
  if (pos.startsWith('sub') || pos.startsWith('-')) marks.push({ type: 'subscript' });
  const ts: Record<string, any> = {};
  const color = attr(tp, 'color');
  if (color && /^#[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== '#000000') ts.color = color.toLowerCase();
  const size = attr(tp, 'font-size');
  if (size && size.endsWith('pt')) ts.fontSize = size;
  const font = attr(tp, 'font-family') ?? attr(tp, 'font-name');
  if (font) ts.fontFamily = font.replace(/'/g, '');
  const bg = attr(tp, 'background-color');
  if (bg && /^#[0-9a-f]{6}$/i.test(bg)) ts.backgroundColor = bg.toLowerCase();
  if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: { color: null, fontFamily: null, fontSize: null, backgroundColor: null, ...ts } });
  return marks;
}

function readStyles(docs: (Document | null)[]): OdfStyles {
  const s: OdfStyles = { text: new Map(), para: new Map(), lists: new Map() };
  for (const doc of docs) {
    if (!doc) continue;
    for (const st of descendants(doc, 'style')) {
      const name = attr(st, 'name');
      if (!name) continue;
      const family = attr(st, 'family');
      const marks = textPropsToMarks(child(st, 'text-properties'));
      if (family === 'text') s.text.set(name, marks);
      if (family === 'paragraph') {
        const pp = child(st, 'paragraph-properties');
        const attrs: Record<string, any> = {};
        const align = attr(pp, 'text-align');
        if (align === 'center') attrs.textAlign = 'center';
        else if (align === 'end' || align === 'right') attrs.textAlign = 'right';
        else if (align === 'justify') attrs.textAlign = 'justify';
        const ml = cssLengthToPx(attr(pp, 'margin-left'));
        if (ml && ml > 10) attrs.indent = Math.min(10, Math.round(ml / INDENT_STEP_PX));
        const ti = cssLengthToPx(attr(pp, 'text-indent'));
        if (ti) attrs.firstLineIndent = Math.round(ti);
        const parent = attr(st, 'parent-style-name') ?? '';
        const hm = /^Heading_20_(\d)$/.exec(name) ?? /^Heading_20_(\d)$/.exec(parent);
        s.para.set(name, {
          attrs,
          marks: name.startsWith('Heading') ? [] : marks,
          breakBefore: attr(pp, 'break-before') === 'page',
          heading: hm ? Number(hm[1]) : undefined,
        });
      }
    }
    for (const ls of descendants(doc, 'list-style')) {
      const name = attr(ls, 'name');
      if (!name) continue;
      const ordered: boolean[] = [];
      for (const lvl of children(ls)) ordered[(Number(attr(lvl, 'level')) || 1) - 1] = lvl.localName === 'list-level-style-number';
      s.lists.set(name, { ordered });
    }
  }
  return s;
}

class OdtReader {
  breakPending = false;
  constructor(
    private zip: JSZip,
    private styles: OdfStyles,
    private warnings: Set<string>,
  ) {}

  async inline(el: Element, marks: Mark[]): Promise<JSONContent[]> {
    const out: JSONContent[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ');
        if (text) out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
        continue;
      }
      if (node.nodeType !== 1) continue;
      const c = node as Element;
      switch (c.localName) {
        case 'span': {
          const st = this.styles.text.get(attr(c, 'style-name') ?? '') ?? [];
          out.push(...(await this.inline(c, mergeMarks(marks, st))));
          break;
        }
        case 'a': {
          const href = attr(c, 'href') ?? '';
          out.push(...(await this.inline(c, [...marks, { type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' } }])));
          break;
        }
        case 's':
          out.push({ type: 'text', text: ' '.repeat(Number(attr(c, 'c') ?? 1)), ...(marks.length ? { marks } : {}) });
          break;
        case 'tab':
          out.push({ type: 'text', text: '\t', ...(marks.length ? { marks } : {}) });
          break;
        case 'line-break':
          out.push({ type: 'hardBreak' });
          break;
        case 'note': {
          const body = child(c, 'note-body');
          out.push({ type: 'footnote', attrs: { text: (body?.textContent ?? '').trim(), kind: attr(c, 'note-class') === 'endnote' ? 'endnote' : 'footnote' } });
          break;
        }
        case 'frame': {
          const img = await this.image(c);
          if (img) out.push(img);
          break;
        }
        case 'bookmark':
        case 'bookmark-start':
        case 'bookmark-end':
        case 'soft-page-break':
          break;
        default:
          out.push(...(await this.inline(c, marks)));
      }
    }
    return mergeAdjacent(out);
  }

  async image(frame: Element): Promise<JSONContent | null> {
    const img = child(frame, 'image');
    const href = attr(img, 'href');
    if (!href) {
      if (child(frame, 'object')) this.warnings.add('Los objetos incrustados (gráficos, fórmulas) no se pueden importar.');
      return null;
    }
    const file = this.zip.file(href.replace(/^\.\//, ''));
    if (!file) {
      this.warnings.add('Las imágenes vinculadas externamente no se cargan por privacidad.');
      return null;
    }
    const mime = mimeFromExtension(href.split('.').pop() ?? '');
    if (!/^image\/(png|jpeg|gif|bmp|svg\+xml|webp)$/.test(mime)) {
      this.warnings.add('Algunas imágenes tienen un formato que el navegador no puede mostrar.');
      return null;
    }
    const bytes = await file.async('uint8array');
    const w = cssLengthToPx(attr(frame, 'width'));
    return { type: 'image', attrs: { src: `data:${mime};base64,${bytesToBase64(bytes)}`, width: w ? Math.round(w) : null, alt: child(frame, 'desc')?.textContent ?? '', align: 'left' } };
  }

  async blocks(el: Element, listStyle?: string, depth = 0): Promise<JSONContent[]> {
    const out: JSONContent[] = [];
    for (const c of children(el)) {
      switch (c.localName) {
        case 'p':
        case 'h': {
          const ps = this.styles.para.get(attr(c, 'style-name') ?? '');
          if (ps?.breakBefore && out.length + (this.breakPending ? 0 : 1) > 0) out.push({ type: 'pageBreak' });
          const content = await this.inline(c, ps?.marks ?? []);
          const blockImgs = content.filter((n) => n.type === 'image');
          const inl = content.filter((n) => n.type !== 'image');
          const level = c.localName === 'h' ? Number(attr(c, 'outline-level') ?? ps?.heading ?? 1) : ps?.heading;
          if (!inl.length && blockImgs.length) {
            out.push(...blockImgs.map((i) => ({ ...i, attrs: { ...i.attrs, align: ps?.attrs.textAlign ?? 'left' } })));
            break;
          }
          const attrs = ps?.attrs ?? {};
          out.push(
            level
              ? { type: 'heading', attrs: { level: Math.min(6, Math.max(1, level)), ...attrs }, ...(inl.length ? { content: inl } : {}) }
              : { type: 'paragraph', ...(Object.keys(attrs).length ? { attrs } : {}), ...(inl.length ? { content: inl } : {}) },
          );
          out.push(...blockImgs);
          break;
        }
        case 'list': {
          const name = attr(c, 'style-name') ?? listStyle;
          const ordered = name ? this.styles.lists.get(name)?.ordered[depth] ?? false : false;
          const items: JSONContent[] = [];
          for (const li of children(c)) {
            if (li.localName !== 'list-item' && li.localName !== 'list-header') continue;
            const inner = await this.blocks(li, name, depth + 1);
            items.push({ type: 'listItem', content: inner.length && inner[0].type === 'paragraph' ? inner : [{ type: 'paragraph' }, ...inner] });
          }
          if (items.length) out.push(ordered ? { type: 'orderedList', attrs: { start: 1 }, content: items } : { type: 'bulletList', content: items });
          break;
        }
        case 'table':
          out.push(await this.table(c));
          break;
        case 'section':
        case 'table-of-content':
          if (c.localName === 'table-of-content') {
            out.push({ type: 'tableOfContents', attrs: { maxLevel: 3, title: 'Índice' } });
          } else out.push(...(await this.blocks(c)));
          break;
        case 'index-body':
          break;
        default:
          break;
      }
    }
    return out;
  }

  async table(t: Element): Promise<JSONContent> {
    const rows: JSONContent[] = [];
    const rowEls = [
      ...children(t, 'table-row'),
      ...children(t, 'table-header-rows').flatMap((h) => children(h, 'table-row')),
      ...children(t, 'table-rows').flatMap((h) => children(h, 'table-row')),
    ];
    const headerRows = new Set(children(t, 'table-header-rows').flatMap((h) => children(h, 'table-row')));
    for (const r of rowEls) {
      const cells: JSONContent[] = [];
      for (const c of children(r)) {
        if (c.localName !== 'table-cell') continue;
        const inner = await this.blocks(c);
        cells.push({
          type: headerRows.has(r) ? 'tableHeader' : 'tableCell',
          attrs: { colspan: Number(attr(c, 'number-columns-spanned') ?? 1), rowspan: Number(attr(c, 'number-rows-spanned') ?? 1), colwidth: null },
          content: inner.length ? inner : [{ type: 'paragraph' }],
        });
      }
      if (cells.length) rows.push({ type: 'tableRow', content: cells });
    }
    return { type: 'table', content: rows };
  }
}

function mergeMarks(base: Mark[], extra: Mark[]): Mark[] {
  const out = base.filter((m) => !extra.some((e) => e.type === m.type));
  return [...out, ...extra];
}

function mergeAdjacent(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev?.type === 'text' && n.type === 'text' && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) prev.text += n.text ?? '';
    else out.push({ ...n });
  }
  return out;
}

export async function importOdt(bytes: Uint8Array): Promise<{ content: WriterContent; warnings: string[] }> {
  inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new FileFormatError('El archivo no es un documento ODT válido (falta content.xml).');
  const contentDoc = parseXml(await contentFile.async('string'), 'content.xml');
  const stylesFile = zip.file('styles.xml');
  const stylesDoc = stylesFile ? parseXml(await stylesFile.async('string'), 'styles.xml') : null;
  const warnings = new Set<string>();
  if (zip.file(/^Basic\//).length || zip.file(/^Scripts\//).length) warnings.add('El documento contiene macros: se han descartado y no se ejecutarán.');
  const styles = readStyles([stylesDoc, contentDoc]);
  const reader = new OdtReader(zip, styles, warnings);
  const text = descendants(contentDoc, 'text').find((e) => e.parentElement?.localName === 'body');
  const blocks = text ? await reader.blocks(text) : [];
  const content = createEmptyDocument({ type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] });

  // Página
  const layout = stylesDoc ? descendants(stylesDoc, 'page-layout-properties')[0] : null;
  if (layout) {
    const w = cssLengthToPx(attr(layout, 'page-width'));
    const h = cssLengthToPx(attr(layout, 'page-height'));
    if (w && h) {
      const wmm = (w / 96) * 25.4;
      const hmm = (h / 96) * 25.4;
      const portrait = [Math.min(wmm, hmm), Math.max(wmm, hmm)];
      const sizes: [PaperSize, number, number][] = [['A4', 210, 297], ['Letter', 215.9, 279.4], ['Legal', 215.9, 355.6], ['A5', 148, 210], ['A3', 297, 420]];
      content.page.size = sizes.reduce((best, s) => (Math.abs(s[1] - portrait[0]) + Math.abs(s[2] - portrait[1]) < Math.abs(best[1] - portrait[0]) + Math.abs(best[2] - portrait[1]) ? s : best))[0];
      content.page.orientation = wmm > hmm ? 'landscape' : 'portrait';
    }
    const m = (k: string, d: number) => {
      const v = cssLengthToPx(attr(layout, k));
      return v !== null ? Math.round(((v / 96) * 25.4) * 10) / 10 : d;
    };
    content.page.margins = { top: m('margin-top', 20), right: m('margin-right', 20), bottom: m('margin-bottom', 20), left: m('margin-left', 20) };
  }
  const master = stylesDoc ? descendants(stylesDoc, 'master-page')[0] : null;
  const hfText = (el: Element | null) => {
    if (!el) return '';
    const clone = el.cloneNode(true) as Element;
    for (const n of descendants(clone, 'page-number')) n.textContent = '{page}';
    for (const n of descendants(clone, 'page-count')) n.textContent = '{pages}';
    return (clone.textContent ?? '').trim();
  };
  const header = hfText(child(master, 'header'));
  const footer = hfText(child(master, 'footer'));
  if (header) content.page.header = { text: header, align: 'center' };
  if (footer) content.page.footer = { text: footer, align: 'center' };
  return { content, warnings: Array.from(warnings) };
}
