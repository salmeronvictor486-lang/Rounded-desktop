import type { JSONContent } from '@tiptap/core';
import { bytesToBase64, dataUrlToBytes } from '@/core/files/download';
import { toHex6 } from '@/core/util/color';
import { imageSize } from '@/core/util/imageSize';
import { pxToTwip, mmToPx } from '@/core/util/units';
import { INDENT_STEP_PX } from '../extensions/paragraphFormat';
import { collectHeadingsJson } from '../extensions/toc';
import { createEmptyDocument, normalizeWriterContent, pageDimensions, type WriterContent } from '../model';

type Mark = { type: string; attrs?: Record<string, any> };

// ======================= EXPORTACIÓN =======================

function rtfEscape(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (ch === '\t') out += '\\tab ';
    else if (ch === '\n') out += '\\line ';
    else if (code < 128) out += ch;
    else if (code > 0xffff) {
      // Pares sustitutos UTF-16
      const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const lo = ((code - 0x10000) % 0x400) + 0xdc00;
      out += `\\u${hi - 65536}?\\u${lo - 65536}?`;
    } else out += `\\u${code > 32767 ? code - 65536 : code}?`;
  }
  return out;
}

class RtfWriter {
  fonts = ['Calibri'];
  colors = ['000000'];
  font(name: string) {
    const clean = name.split(',')[0].replace(/["']/g, '').trim();
    let i = this.fonts.indexOf(clean);
    if (i < 0) i = this.fonts.push(clean) - 1;
    return i;
  }
  color(hex: string) {
    let i = this.colors.indexOf(hex);
    if (i < 0) i = this.colors.push(hex) - 1;
    return i + 1; // índice 0 = automático
  }
}

function runRtf(n: JSONContent, w: RtfWriter): string {
  if (n.type === 'hardBreak') return '\\line ';
  if (n.type === 'footnote') return `{\\super\\chftn}{\\footnote\\pard\\plain\\fs18 {\\super\\chftn} ${rtfEscape(String(n.attrs?.text ?? ''))}}`;
  if (n.type === 'image') return imageRtf(n);
  if (n.type !== 'text') return '';
  let pre = '';
  for (const m of (n.marks ?? []) as Mark[]) {
    if (m.type === 'bold') pre += '\\b';
    if (m.type === 'italic') pre += '\\i';
    if (m.type === 'underline') pre += '\\ul';
    if (m.type === 'strike') pre += '\\strike';
    if (m.type === 'superscript') pre += '\\super';
    if (m.type === 'subscript') pre += '\\sub';
    if (m.type === 'link') pre += '\\ul';
    if (m.type === 'textStyle') {
      const c = toHex6(m.attrs?.color);
      if (c) pre += `\\cf${w.color(c)}`;
      const size = parseFloat(String(m.attrs?.fontSize ?? ''));
      if (size) pre += `\\fs${Math.round((String(m.attrs?.fontSize).endsWith('px') ? size * 0.75 : size) * 2)}`;
      if (m.attrs?.fontFamily) pre += `\\f${w.font(String(m.attrs.fontFamily))}`;
      const bg = toHex6(m.attrs?.backgroundColor);
      if (bg) pre += `\\highlight${w.color(bg)}`;
    }
    if (m.type === 'highlight') pre += `\\highlight${w.color(toHex6(m.attrs?.color) ?? 'FFFF00')}`;
  }
  const link = (n.marks ?? []).find((m) => m.type === 'link');
  const body = `{${pre}${pre ? ' ' : ''}${rtfEscape(n.text ?? '')}}`;
  if (link) return `{\\field{\\*\\fldinst{HYPERLINK "${String(link.attrs?.href ?? '').replace(/["\\{}]/g, '')}"}}{\\fldrslt${body}}}`;
  return body;
}

function imageRtf(n: JSONContent): string {
  const src = String(n.attrs?.src ?? '');
  if (!src.startsWith('data:')) return '';
  const { bytes } = dataUrlToBytes(src);
  const size = imageSize(bytes);
  if (!size || (size.type !== 'png' && size.type !== 'jpg')) return '';
  const w = Math.min(Number(n.attrs?.width) || size.width, 640);
  const h = (w * size.height) / Math.max(1, size.width);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `{\\pict\\${size.type === 'png' ? 'pngblip' : 'jpegblip'}\\picw${size.width}\\pich${size.height}\\picwgoal${pxToTwip(w)}\\pichgoal${pxToTwip(h)} ${hex}}`;
}

function paraRtf(attrs: Record<string, any> = {}, extra = ''): string {
  let s = '\\pard\\plain';
  const a = attrs.textAlign;
  s += a === 'center' ? '\\qc' : a === 'right' ? '\\qr' : a === 'justify' ? '\\qj' : '\\ql';
  if (attrs.indent) s += `\\li${pxToTwip(attrs.indent * INDENT_STEP_PX)}`;
  if (attrs.firstLineIndent) s += `\\fi${pxToTwip(attrs.firstLineIndent)}`;
  if (attrs.spaceBefore != null) s += `\\sb${Math.round(attrs.spaceBefore * 20)}`;
  s += `\\sa${attrs.spaceAfter != null ? Math.round(attrs.spaceAfter * 20) : 160}`;
  if (attrs.lineHeight) s += `\\sl${Math.round(attrs.lineHeight * 240)}\\slmult1`;
  return s + extra + ' ';
}

function blocksRtf(nodes: JSONContent[] = [], w: RtfWriter, doc: JSONContent, depth = 0): string {
  let out = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        out += `${paraRtf(n.attrs)}${(n.content ?? []).map((c) => runRtf(c, w)).join('')}\\par\n`;
        break;
      case 'heading': {
        const lvl = Number(n.attrs?.level ?? 1);
        const size = [40, 32, 26, 24, 22, 22][lvl - 1];
        out += `${paraRtf(n.attrs, `\\s${lvl}\\outlinelevel${lvl - 1}\\keepn\\sb240`)}{\\b\\fs${size} ${(n.content ?? []).map((c) => runRtf(c, w)).join('')}}\\par\n`;
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        let k = Number(n.attrs?.start ?? 1);
        for (const li of n.content ?? []) {
          (li.content ?? []).forEach((c, i) => {
            if (c.type === 'paragraph') {
              const marker = i === 0 ? (n.type === 'bulletList' ? '\\u8226?' : `${k}.`) : '';
              out += `\\pard\\plain\\ql\\li${360 * (depth + 2)}\\fi-360\\sa60 ${marker}\\tab ${(c.content ?? []).map((x) => runRtf(x, w)).join('')}\\par\n`;
            } else out += blocksRtf([c], w, doc, depth + 1);
          });
          k++;
        }
        break;
      }
      case 'blockquote':
        out += blocksRtf((n.content ?? []).map((c) => ({ ...c, attrs: { ...(c.attrs ?? {}), indent: (c.attrs?.indent ?? 0) + 1 } })), w, doc, depth);
        break;
      case 'codeBlock':
        out += `\\pard\\plain\\ql {\\f${w.font('Courier New')}\\fs20 ${rtfEscape((n.content ?? []).map((c) => c.text ?? '').join(''))}}\\par\n`;
        break;
      case 'horizontalRule':
        out += '\\pard\\plain\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n';
        break;
      case 'pageBreak':
        out += '\\page\n';
        break;
      case 'image':
        out += `${paraRtf({ textAlign: n.attrs?.align })}${imageRtf(n)}\\par\n`;
        break;
      case 'tableOfContents':
        out += `\\pard\\plain {\\b\\fs28 ${rtfEscape(String(n.attrs?.title ?? 'Índice'))}}\\par\n`;
        for (const e of collectHeadingsJson(doc, Number(n.attrs?.maxLevel ?? 3))) out += `\\pard\\plain\\li${(e.level - 1) * 360} ${rtfEscape(e.text)}\\par\n`;
        break;
      case 'table': {
        for (const r of n.content ?? []) {
          const cells = r.content ?? [];
          const totalCols = cells.reduce((a, c) => a + Number(c.attrs?.colspan ?? 1), 0) || 1;
          let x = 0;
          let row = '\\trowd\\trgaph108';
          for (const c of cells) {
            x += Math.round((9000 / totalCols) * Number(c.attrs?.colspan ?? 1));
            const bg = toHex6(c.attrs?.backgroundColor);
            row += `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs${bg ? `\\clcbpat${w.color(bg)}` : ''}\\cellx${x}`;
          }
          out += row + '\n';
          for (const c of cells) {
            const inner = (c.content ?? [])
              .map((pp) => (pp.content ?? []).map((x) => runRtf(x, w)).join(''))
              .join('\\line ');
            out += `\\pard\\intbl ${c.type === 'tableHeader' ? `{\\b ${inner}}` : inner}\\cell\n`;
          }
          out += '\\row\n';
        }
        out += '\\pard\n';
        break;
      }
      default:
        out += blocksRtf(n.content, w, doc, depth);
    }
  }
  return out;
}

export function exportRtf(input: WriterContent): Blob {
  const content = normalizeWriterContent(input);
  const w = new RtfWriter();
  if (content.styles?.body?.fontFamily) w.fonts[0] = content.styles.body.fontFamily;
  const body = blocksRtf(content.doc.content, w, content.doc);
  const dims = pageDimensions(content.page);
  const t = (mm: number) => pxToTwip(mmToPx(mm));
  const m = content.page.margins;
  const fs = Math.round((content.styles?.body?.fontSize ?? 11) * 2);
  const rtf =
    `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1` +
    `{\\fonttbl${w.fonts.map((f, i) => `{\\f${i}\\fnil ${f.replace(/[\\{};]/g, '')};}`).join('')}}` +
    `{\\colortbl;${w.colors.map((c) => `\\red${parseInt(c.slice(0, 2), 16)}\\green${parseInt(c.slice(2, 4), 16)}\\blue${parseInt(c.slice(4, 6), 16)};`).join('')}}` +
    `{\\*\\generator Rounded Scribe;}` +
    `\\paperw${t(dims.width)}\\paperh${t(dims.height)}${content.page.orientation === 'landscape' ? '\\landscape' : ''}\\margl${t(m.left)}\\margr${t(m.right)}\\margt${t(m.top)}\\margb${t(m.bottom)}` +
    (content.page.columns > 1 ? `\\cols${content.page.columns}\\colsx${t(content.page.columnGap)}` : '') +
    `\\fs${fs}\n` +
    (content.page.header.text ? `{\\header\\pard\\plain\\q${content.page.header.align[0]} \\fs18 ${rtfEscape(content.page.header.text).replace(/\{page\}/g, '{\\field{\\*\\fldinst PAGE}}').replace(/\{pages\}/g, '{\\field{\\*\\fldinst NUMPAGES}}')}\\par}\n` : '') +
    (content.page.footer.text ? `{\\footer\\pard\\plain\\q${content.page.footer.align[0]} \\fs18 ${rtfEscape(content.page.footer.text).replace(/\{page\}/g, '{\\field{\\*\\fldinst PAGE}}').replace(/\{pages\}/g, '{\\field{\\*\\fldinst NUMPAGES}}')}\\par}\n` : '') +
    body +
    '}';
  return new Blob([rtf], { type: 'application/rtf' });
}

// ======================= IMPORTACIÓN =======================

interface CharState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sup: boolean;
  sub: boolean;
  fontSize: number;
  color: number;
  highlight: number;
  font: number;
  uc: number;
  hidden: boolean;
}

interface ParaState {
  align: string;
  li: number;
  fi: number;
  sb: number | null;
  sa: number | null;
  intbl: boolean;
  outline: number | null;
}

const SKIP_DESTS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'mmathPr', 'themedata', 'colorschememapping', 'latentstyles',
  'datastore', 'pgdsctbl', 'revtbl', 'filetbl', 'fldinst', 'object', 'nonshppict', 'bkmkstart', 'bkmkend', 'shp', 'shpinst',
]);

/** Analizador RTF: texto, formato de carácter y párrafo, listas simples, tablas, imágenes PNG/JPEG y notas al pie. */
export function importRtf(text: string): { content: WriterContent; warnings: string[] } {
  const warnings = new Set<string>();
  const fonts = new Map<number, string>();
  const colors: (string | null)[] = [null];
  let codepage = 1252;

  const blocks: JSONContent[] = [];
  let inline: JSONContent[] = [];
  let tableRows: JSONContent[][] = [];
  let currentRow: JSONContent[] = [];
  let cellParas: JSONContent[] = [];

  const defaultChar = (): CharState => ({ bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, fontSize: 22, color: 0, highlight: 0, font: 0, uc: 1, hidden: false });
  const defaultPara = (): ParaState => ({ align: 'left', li: 0, fi: 0, sb: null, sa: null, intbl: false, outline: null });
  let ch = defaultChar();
  let para = defaultPara();
  const stack: { ch: CharState; dest: string | null; skip: boolean; field: number }[] = [];
  let dest: string | null = null;
  let skipGroup = false;
  let pictHex = '';
  let pictType = '';
  let pictW = 0;
  let footnoteText = '';
  let linkHref: string | null = null;
  let ucSkip = 0;
  const baseFontSize = 22;
  let pendingColor: Partial<Record<'red' | 'green' | 'blue', number>> = {};
  let seenFirstSemicolon = false;

  const flushTable = () => {
    if (!tableRows.length) return;
    blocks.push({ type: 'table', content: tableRows.map((r) => ({ type: 'tableRow', content: r })) });
    tableRows = [];
  };

  const marksFor = (): JSONContent['marks'] => {
    const m: Mark[] = [];
    if (ch.bold) m.push({ type: 'bold' });
    if (ch.italic) m.push({ type: 'italic' });
    if (ch.underline && !linkHref) m.push({ type: 'underline' });
    if (ch.strike) m.push({ type: 'strike' });
    if (ch.sup) m.push({ type: 'superscript' });
    if (ch.sub) m.push({ type: 'subscript' });
    const ts: Record<string, any> = {};
    const color = colors[ch.color];
    if (color && color !== '#000000') ts.color = color;
    if (ch.fontSize !== baseFontSize) ts.fontSize = `${ch.fontSize / 2}pt`;
    if (ch.font && fonts.get(ch.font)) ts.fontFamily = fonts.get(ch.font);
    if (Object.keys(ts).length) m.push({ type: 'textStyle', attrs: { color: null, fontFamily: null, fontSize: null, backgroundColor: null, ...ts } });
    if (ch.highlight && colors[ch.highlight]) m.push({ type: 'highlight', attrs: { color: colors[ch.highlight] } });
    if (linkHref) m.push({ type: 'link', attrs: { href: linkHref, target: '_blank', rel: 'noopener noreferrer nofollow' } });
    return m.length ? m : undefined;
  };

  const emit = (s: string) => {
    if (!s || ch.hidden) return;
    if (dest === 'footnote') {
      footnoteText += s;
      return;
    }
    const marks = marksFor();
    const prev = inline[inline.length - 1];
    if (prev?.type === 'text' && JSON.stringify(prev.marks) === JSON.stringify(marks)) prev.text += s;
    else inline.push(marks ? { type: 'text', text: s, marks } : { type: 'text', text: s });
  };

  const endParagraph = () => {
    const attrs: Record<string, any> = {};
    if (para.align !== 'left') attrs.textAlign = para.align;
    if (para.li > 0) attrs.indent = Math.min(10, Math.round(para.li / 15 / INDENT_STEP_PX));
    if (para.fi) attrs.firstLineIndent = Math.round(para.fi / 15);
    if (para.sb != null) attrs.spaceBefore = para.sb / 20;
    if (para.sa != null && para.sa !== 160) attrs.spaceAfter = para.sa / 20;
    const content = inline;
    inline = [];
    const imgs = content.filter((n) => n.type === 'image');
    const rest = content.filter((n) => n.type !== 'image');
    let node: JSONContent;
    if (para.outline != null && para.outline < 6) node = { type: 'heading', attrs: { level: para.outline + 1, ...attrs }, ...(rest.length ? { content: rest } : {}) };
    else node = { type: 'paragraph', ...(Object.keys(attrs).length ? { attrs } : {}), ...(rest.length ? { content: rest } : {}) };
    if (!para.intbl) flushTable();
    const target = para.intbl ? cellParas : blocks;
    if (rest.length || !imgs.length) target.push(node);
    for (const img of imgs) target.push({ ...img, attrs: { ...img.attrs, align: attrs.textAlign ?? 'left' } });
  };

  const decodeByte = (b: number) => new TextDecoder(`windows-${codepage}`).decode(new Uint8Array([b]));

  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '{') {
      stack.push({ ch: { ...ch }, dest, skip: skipGroup, field: 0 });
      i++;
      continue;
    }
    if (c === '}') {
      const top = stack.pop();
      if (dest === 'pict' && pictHex && top && top.dest !== 'pict') {
        const clean = pictHex.replace(/[^0-9a-f]/gi, '');
        if (pictType) {
          const bytes = new Uint8Array(clean.length / 2);
          for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(clean.substr(k * 2, 2), 16);
          inline.push({ type: 'image', attrs: { src: `data:image/${pictType};base64,${bytesToBase64(bytes)}`, width: pictW || null, alt: '', align: 'left' } });
        } else warnings.add('Algunas imágenes del RTF (WMF/EMF) no se pueden mostrar y no se han importado.');
        pictHex = '';
        pictType = '';
      }
      if (dest === 'footnote' && top && top.dest !== 'footnote') {
        inline.push({ type: 'footnote', attrs: { text: footnoteText.trim(), kind: 'footnote' } });
        footnoteText = '';
      }
      if (dest === 'fldrslt' && top && top.dest !== 'fldrslt') linkHref = null;
      if (top) {
        ch = top.ch;
        dest = top.dest;
        skipGroup = top.skip;
      }
      i++;
      continue;
    }
    if (c === '\\') {
      const next = text[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (!skipGroup) emit(next);
        i += 2;
        continue;
      }
      if (next === "'") {
        const hex = text.substr(i + 2, 2);
        if (ucSkip > 0) ucSkip--;
        else if (!skipGroup && dest !== 'pict') emit(decodeByte(parseInt(hex, 16)));
        i += 4;
        continue;
      }
      if (next === '*') {
        // Destino opcional: si no lo conocemos, se omite el grupo.
        const m = /^\\\*\\([a-zA-Z]+)/.exec(text.slice(i, i + 40));
        const name = m?.[1] ?? '';
        if (name !== 'footnote') skipGroup = true;
        i += 2;
        continue;
      }
      if (next === '~') {
        if (!skipGroup) emit('\u00A0');
        i += 2;
        continue;
      }
      if (next === '-' || next === '_') {
        if (!skipGroup) emit(next === '_' ? '\u2011' : '\u00AD');
        i += 2;
        continue;
      }
      if (next === '\n' || next === '\r') {
        if (!skipGroup) endParagraph();
        i += 2;
        continue;
      }
      const m = /^\\([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(text.slice(i, i + 48));
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length;
      const word = m[1];
      const param = m[2] !== undefined ? Number(m[2]) : null;
      if (SKIP_DESTS.has(word)) {
        if (word === 'fonttbl' || word === 'colortbl') dest = word;
        else if (word === 'fldinst') dest = 'fldinst';
        else {
          if (word.startsWith('header') || word.startsWith('footer')) warnings.add('Los encabezados y pies de página del RTF no se han importado.');
          skipGroup = true;
        }
        continue;
      }
      if (skipGroup) continue;
      switch (word) {
        case 'ansicpg':
          codepage = param ?? 1252;
          break;
        case 'pict':
          dest = 'pict';
          pictHex = '';
          pictType = '';
          break;
        case 'pngblip':
          pictType = 'png';
          break;
        case 'jpegblip':
          pictType = 'jpeg';
          break;
        case 'picwgoal':
          pictW = Math.round((param ?? 0) / 15);
          break;
        case 'footnote':
          dest = 'footnote';
          footnoteText = '';
          break;
        case 'fldrslt':
          dest = 'fldrslt';
          break;
        case 'f':
          if (dest === 'fonttbl') {
            const end = text.indexOf(';', i);
            const name = text.slice(i, end).replace(/\{[^}]*\}|\\[a-z]+\d* ?/g, '').trim();
            fonts.set(param ?? 0, name);
            i = end + 1;
          } else ch.font = param ?? 0;
          break;
        case 'red':
        case 'green':
        case 'blue':
          if (dest === 'colortbl') pendingColor[word] = param ?? 0;
          break;
        case 'b':
          ch.bold = param !== 0;
          break;
        case 'i':
          ch.italic = param !== 0;
          break;
        case 'ul':
          ch.underline = param !== 0;
          break;
        case 'ulnone':
          ch.underline = false;
          break;
        case 'strike':
          ch.strike = param !== 0;
          break;
        case 'super':
          ch.sup = true;
          break;
        case 'sub':
          ch.sub = true;
          break;
        case 'nosupersub':
          ch.sup = ch.sub = false;
          break;
        case 'fs':
          ch.fontSize = param ?? 22;
          break;
        case 'cf':
          ch.color = param ?? 0;
          break;
        case 'highlight':
        case 'cb':
          ch.highlight = param ?? 0;
          break;
        case 'v':
          ch.hidden = param !== 0;
          break;
        case 'plain':
          ch = { ...defaultChar(), fontSize: baseFontSize, uc: ch.uc };
          break;
        case 'deff':
          break;
        case 'uc':
          ch.uc = param ?? 1;
          break;
        case 'u': {
          let code = param ?? 0;
          if (code < 0) code += 65536;
          emit(String.fromCharCode(code));
          ucSkip = ch.uc;
          break;
        }
        case 'par':
          endParagraph();
          break;
        case 'line':
          inline.push({ type: 'hardBreak' });
          break;
        case 'tab':
          emit('\t');
          break;
        case 'page':
          if (inline.length) endParagraph();
          flushTable();
          blocks.push({ type: 'pageBreak' });
          break;
        case 'pard':
          para = defaultPara();
          break;
        case 'ql':
          para.align = 'left';
          break;
        case 'qc':
          para.align = 'center';
          break;
        case 'qr':
          para.align = 'right';
          break;
        case 'qj':
          para.align = 'justify';
          break;
        case 'li':
          para.li = param ?? 0;
          break;
        case 'fi':
          para.fi = param ?? 0;
          break;
        case 'sb':
          para.sb = param;
          break;
        case 'sa':
          para.sa = param;
          break;
        case 'outlinelevel':
          para.outline = param;
          break;
        case 'intbl':
          para.intbl = true;
          break;
        case 'cell': {
          if (inline.length) endParagraph();
          currentRow.push({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: cellParas.length ? cellParas : [{ type: 'paragraph' }] });
          cellParas = [];
          break;
        }
        case 'row':
          if (currentRow.length) tableRows.push(currentRow);
          currentRow = [];
          break;
        case 'trowd':
          break;
        case 'emdash':
          emit('—');
          break;
        case 'endash':
          emit('–');
          break;
        case 'bullet':
          emit('•');
          break;
        case 'lquote':
          emit('‘');
          break;
        case 'rquote':
          emit('’');
          break;
        case 'ldblquote':
          emit('“');
          break;
        case 'rdblquote':
          emit('”');
          break;
        default:
          break;
      }
      continue;
    }
    // Texto literal
    if (c === '\r' || c === '\n') {
      i++;
      continue;
    }
    if (dest === 'colortbl') {
      if (c === ';') {
        if (pendingColor.red !== undefined || pendingColor.green !== undefined || pendingColor.blue !== undefined) {
          const hex = [pendingColor.red ?? 0, pendingColor.green ?? 0, pendingColor.blue ?? 0].map((v) => v.toString(16).padStart(2, '0')).join('');
          colors.push(`#${hex}`);
        } else if (seenFirstSemicolon) colors.push(null);
        seenFirstSemicolon = true;
        pendingColor = {};
      }
      i++;
      continue;
    }
    if (dest === 'fldinst') {
      const end = text.indexOf('}', i);
      const instr = text.slice(i, end);
      const hm = /HYPERLINK\s+"([^"]+)"/.exec(instr);
      if (hm && /^(https?:|mailto:)/i.test(hm[1])) linkHref = hm[1];
      i = end;
      continue;
    }
    if (dest === 'pict') {
      pictHex += c;
      i++;
      continue;
    }
    if (skipGroup || dest === 'fonttbl') {
      i++;
      continue;
    }
    if (ucSkip > 0) {
      ucSkip--;
      i++;
      continue;
    }
    // Acumular texto hasta el siguiente carácter especial
    let j = i;
    while (j < n && !'\\{}\r\n'.includes(text[j])) j++;
    emit(text.slice(i, j));
    i = j;
  }
  if (inline.length) endParagraph();
  flushTable();
  const content = createEmptyDocument({ type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] });
  return { content, warnings: Array.from(warnings) };
}
