import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';
import { inspectZip } from '@/core/files/zipGuard';
import { FileFormatError } from '@/core/files/errors';
import { attr, attrNum, child, children, descendants, path } from '@/core/files/xml';
import { bytesToBase64, mimeFromExtension } from '@/core/files/download';
import { WORD_HIGHLIGHTS } from '@/core/util/color';
import { emuToPx, pxToMm, twipToPx } from '@/core/util/units';
import { INDENT_STEP_PX } from '../../extensions/paragraphFormat';
import { createEmptyDocument, DEFAULT_PAGE, type DocumentStyles, type PageSettings, type PaperSize, type TextStyleDef, type WriterContent } from '../../model';
import {
  effectivePara,
  effectiveRun,
  headingLevel,
  isStyleNamed,
  loadNotes,
  loadNumbering,
  loadStyles,
  loadTheme,
  parseParaProps,
  parseRunProps,
  readRels,
  readXml,
  type DocxContext,
  type ParaProps,
  type RunProps,
} from './parts';

type Mark = { type: string; attrs?: Record<string, unknown> };

interface ParaResult {
  kind: 'para';
  node: JSONContent;
  list?: { numId: string; level: number; ordered: boolean; start: number; type: string };
  /** Bloques adicionales (saltos de página, imágenes de bloque) que siguen al párrafo. */
  breakBefore?: boolean;
  isToc?: boolean;
}

const BROWSER_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp']);

function sameMarks(a: Mark[] = [], b: Mark[] = []): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Une nodos de texto contiguos con las mismas marcas. */
function mergeText(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (n.type === 'text' && prev?.type === 'text' && sameMarks(prev.marks as Mark[], n.marks as Mark[])) {
      prev.text = (prev.text ?? '') + (n.text ?? '');
    } else if (n.type !== 'text' || n.text) {
      out.push(n);
    }
  }
  return out;
}

function runMarks(p: RunProps, base: RunProps, link?: string): Mark[] {
  const marks: Mark[] = [];
  const diff = <K extends keyof RunProps>(k: K) => (p[k] !== undefined && p[k] !== base[k] ? p[k] : undefined);
  if (p.bold && !base.bold) marks.push({ type: 'bold' });
  if (p.italic && !base.italic) marks.push({ type: 'italic' });
  if (p.underline && !base.underline && !link) marks.push({ type: 'underline' });
  if (p.strike && !base.strike) marks.push({ type: 'strike' });
  if (p.vertAlign === 'superscript') marks.push({ type: 'superscript' });
  if (p.vertAlign === 'subscript') marks.push({ type: 'subscript' });
  const ts: Record<string, unknown> = {};
  const color = diff('color');
  if (color && !link) ts.color = color;
  const font = diff('fontFamily');
  if (font) ts.fontFamily = font;
  const size = diff('fontSize');
  if (size) ts.fontSize = `${size}pt`;
  if (p.background) ts.backgroundColor = p.background;
  if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: { color: null, fontFamily: null, fontSize: null, backgroundColor: null, ...ts } });
  if (p.highlight && WORD_HIGHLIGHTS[p.highlight]) marks.push({ type: 'highlight', attrs: { color: `#${WORD_HIGHLIGHTS[p.highlight]}` } });
  if (link) marks.push({ type: 'link', attrs: { href: link, target: '_blank', rel: 'noopener noreferrer nofollow' } });
  return marks;
}

function listTypeAttr(format: string): string {
  switch (format) {
    case 'lowerLetter':
      return 'a';
    case 'upperLetter':
      return 'A';
    case 'lowerRoman':
      return 'i';
    case 'upperRoman':
      return 'I';
    default:
      return '1';
  }
}

class BodyParser {
  /** Estado de campos complejos (w:fldChar) dentro del párrafo actual. */
  private fieldDepth = 0;
  private fieldInstr = '';
  private fieldShowResult = true;

  constructor(
    private readonly ctx: DocxContext,
    private readonly rels: DocxContext['rels'],
    private readonly bodyRun: RunProps,
  ) {}

  async blocks(container: Element): Promise<JSONContent[]> {
    const items: (ParaResult | { kind: 'block'; node: JSONContent })[] = [];
    await this.collect(container, items);
    return this.assemble(items);
  }

  private async collect(container: Element, items: (ParaResult | { kind: 'block'; node: JSONContent })[]): Promise<void> {
    for (const el of children(container)) {
      switch (el.localName) {
        case 'p': {
          const r = await this.paragraph(el);
          items.push(...r);
          break;
        }
        case 'tbl':
          items.push({ kind: 'block', node: await this.table(el) });
          break;
        case 'sdt': {
          const gallery = attr(path(el, 'sdtPr', 'docPartObj', 'docPartGallery'), 'val');
          if (gallery && /table of contents/i.test(gallery)) {
            items.push({ kind: 'block', node: { type: 'tableOfContents', attrs: { maxLevel: 3, title: 'Índice' } } });
          } else {
            const content = child(el, 'sdtContent');
            if (content) await this.collect(content, items);
          }
          break;
        }
        case 'customXml':
        case 'ins':
        case 'smartTag':
          await this.collect(el, items);
          break;
        case 'altChunk':
          this.ctx.warnings.add('Contenido incrustado externo (altChunk) no importado.');
          break;
        default:
          break;
      }
    }
  }

  /** Convierte la lista plana de párrafos en listas anidadas y une entradas de índice. */
  private assemble(items: (ParaResult | { kind: 'block'; node: JSONContent })[]): JSONContent[] {
    const out: JSONContent[] = [];
    let stack: { level: number; ordered: boolean; node: JSONContent }[] = [];
    let lastWasToc = false;
    for (const it of items) {
      if (it.kind === 'para' && it.isToc) {
        if (!lastWasToc && !(out[out.length - 1]?.type === 'tableOfContents')) {
          out.push({ type: 'tableOfContents', attrs: { maxLevel: 3, title: 'Índice' } });
        }
        lastWasToc = true;
        stack = [];
        continue;
      }
      lastWasToc = false;
      if (it.kind === 'para' && it.breakBefore) {
        stack = [];
        out.push({ type: 'pageBreak' });
      }
      if (it.kind === 'para' && it.list) {
        const { level, ordered } = it.list;
        while (stack.length && stack[stack.length - 1].level > level) stack.pop();
        let top = stack[stack.length - 1];
        if (top && top.level === level && top.ordered !== ordered) {
          stack.pop();
          top = stack[stack.length - 1];
        }
        const item: JSONContent = { type: 'listItem', content: [it.node] };
        if (top && top.level === level) {
          top.node.content!.push(item);
        } else {
          const list: JSONContent = ordered
            ? { type: 'orderedList', attrs: { start: it.list.start, type: it.list.type }, content: [item] }
            : { type: 'bulletList', content: [item] };
          if (top) {
            const parentItems = top.node.content!;
            const lastItem = parentItems[parentItems.length - 1];
            lastItem.content!.push(list);
          } else {
            out.push(list);
          }
          stack.push({ level, ordered, node: list });
        }
        continue;
      }
      stack = [];
      out.push(it.node);
    }
    return out;
  }

  private async paragraph(p: Element): Promise<ParaResult[]> {
    const pPrEl = child(p, 'pPr');
    const direct = parseParaProps(pPrEl);
    const styleId = attr(child(pPrEl, 'pStyle'), 'val') ?? this.ctx.defaultParaStyle;
    const level = headingLevel(this.ctx, styleId, direct);
    const isDefaultStyle = !styleId || styleId === this.ctx.defaultParaStyle;
    if (path(pPrEl, 'sectPr') && attr(path(pPrEl, 'sectPr', 'type'), 'val') !== 'continuous') {
      this.ctx.warnings.add('El documento tiene varias secciones: se han unificado (los cambios de orientación o márgenes por sección no se conservan).');
    }
    const isTocEntry = isStyleNamed(this.ctx, styleId, /^(toc|tdc)\s?[1-9]$/i);

    // Propiedades de párrafo: estilo (salvo Normal/títulos) + directas.
    const stylePara = level || isDefaultStyle ? {} : effectivePara(this.ctx, styleId);
    const pp: ParaProps = { ...stylePara, ...direct };
    // Propiedades de carácter heredadas del estilo de párrafo
    const paraRunBase: RunProps = level ? {} : isDefaultStyle ? {} : effectiveRun(this.ctx, styleId);
    const styleRunForMarks = { ...paraRunBase };
    const baseForDiff: RunProps = level ? effectiveRun(this.ctx, styleId) : this.bodyRun;

    const pieces: JSONContent[][] = [[]];
    const breaks: boolean[] = [];
    await this.inline(p, pieces, breaks, styleRunForMarks, baseForDiff, undefined);

    const attrs: Record<string, unknown> = {};
    if (pp.align && pp.align !== 'left') attrs.textAlign = pp.align;
    const numPr = pp.numId ?? (level ? undefined : effectivePara(this.ctx, styleId).numId);
    const isList = !level && numPr && numPr !== '0' && this.ctx.numbering.has(numPr);
    if (!isList && pp.indentLeft) attrs.indent = Math.max(0, Math.min(10, Math.round(twipToPx(pp.indentLeft) / INDENT_STEP_PX)));
    if (!isList && pp.firstLine) attrs.firstLineIndent = Math.round(twipToPx(pp.firstLine));
    if (pp.lineHeight && Math.abs(pp.lineHeight - (this.ctx.defaultPara.lineHeight ?? 1.15)) > 0.01) attrs.lineHeight = pp.lineHeight;
    if (!level && pp.spaceBefore !== undefined && direct.spaceBefore !== undefined) attrs.spaceBefore = pp.spaceBefore / 20;
    if (!level && pp.spaceAfter !== undefined && direct.spaceAfter !== undefined) attrs.spaceAfter = pp.spaceAfter / 20;

    const results: ParaResult[] = [];
    // Un salto de página divide el párrafo; las partes vacías resultantes no son párrafos reales.
    const split = pieces.length > 1;
    let pendingBreak = !!pp.pageBreakBefore;
    pieces.forEach((content, idx) => {
      if (idx > 0) pendingBreak = true;
      const merged = mergeText(content);
      if (split && merged.length === 0) return;
      const breakBefore = pendingBreak;
      pendingBreak = false;
      // Las imágenes se representan como bloques: si un párrafo solo contiene imágenes, se emiten como bloques.
      const blockImages = merged.filter((n) => n.type === 'image');
      const inlineContent = merged.filter((n) => n.type !== 'image');
      const node: JSONContent = level
        ? { type: 'heading', attrs: { level, ...attrs }, ...(inlineContent.length ? { content: inlineContent } : {}) }
        : { type: 'paragraph', ...(Object.keys(attrs).length ? { attrs } : {}), ...(inlineContent.length ? { content: inlineContent } : {}) };
      const res: ParaResult = { kind: 'para', node, breakBefore, isToc: isTocEntry };
      if (isList) {
        const lvl = pp.ilvl ?? effectivePara(this.ctx, styleId).ilvl ?? 0;
        const def = this.ctx.numbering.get(numPr!)?.get(lvl);
        const ordered = !!def && def.format !== 'bullet' && def.format !== 'none';
        res.list = { numId: numPr!, level: lvl, ordered, start: def?.start ?? 1, type: listTypeAttr(def?.format ?? 'decimal') };
      }
      if (blockImages.length && !inlineContent.length && !res.list) {
        blockImages.forEach((img, i) =>
          results.push({ kind: 'para', node: { ...img, attrs: { ...img.attrs, align: (attrs.textAlign as string) ?? img.attrs?.align ?? 'left' } }, breakBefore: i === 0 && res.breakBefore }),
        );
        return;
      }
      results.push(res);
      for (const img of blockImages) results.push({ kind: 'para', node: img });
    });
    if (pendingBreak) results.push({ kind: 'block', node: { type: 'pageBreak' } } as any);
    return results;
  }

  /** Procesa el contenido en línea; `pieces` se divide en cada salto de página. */
  private async inline(
    el: Element,
    pieces: JSONContent[][],
    breaks: boolean[],
    styleRun: RunProps,
    base: RunProps,
    link: string | undefined,
  ): Promise<void> {
    for (const c of children(el)) {
      const cur = () => pieces[pieces.length - 1];
      switch (c.localName) {
        case 'r':
          await this.run(c, pieces, styleRun, base, link);
          break;
        case 'hyperlink': {
          const rid = attr(c, 'id');
          const anchor = attr(c, 'anchor');
          let href: string | undefined;
          if (rid) {
            const rel = this.rels.get(rid);
            if (rel?.external) href = rel.target;
          } else if (anchor) href = `#${anchor}`;
          await this.inline(c, pieces, breaks, styleRun, base, href);
          break;
        }
        case 'ins':
          this.ctx.warnings.add('El documento tenía cambios controlados: se han aceptado las inserciones y eliminaciones.');
          await this.inline(c, pieces, breaks, styleRun, base, link);
          break;
        case 'del':
          this.ctx.warnings.add('El documento tenía cambios controlados: se han aceptado las inserciones y eliminaciones.');
          break;
        case 'smartTag':
        case 'customXml':
        case 'dir':
        case 'bdo':
          await this.inline(c, pieces, breaks, styleRun, base, link);
          break;
        case 'sdt': {
          const content = child(c, 'sdtContent');
          if (content) await this.inline(content, pieces, breaks, styleRun, base, link);
          break;
        }
        case 'fldSimple': {
          const instr = (attr(c, 'instr') ?? '').trim().toUpperCase();
          if (instr.startsWith('PAGE') || instr.startsWith('NUMPAGES')) {
            await this.inline(c, pieces, breaks, styleRun, base, link);
          } else {
            await this.inline(c, pieces, breaks, styleRun, base, link);
          }
          break;
        }
        case 'oMath':
        case 'oMathPara':
          this.ctx.warnings.add('Las ecuaciones se han importado como texto sin formato.');
          cur().push({ type: 'text', text: descendants(c, 't').map((t) => t.textContent ?? '').join('') });
          break;
        default:
          break;
      }
    }
  }

  private async run(r: Element, pieces: JSONContent[][], styleRun: RunProps, base: RunProps, link: string | undefined) {
    const rPrEl = child(r, 'rPr');
    const rStyle = attr(child(rPrEl, 'rStyle'), 'val') ?? undefined;
    const props: RunProps = { ...styleRun, ...(rStyle ? effectiveRun(this.ctx, rStyle) : {}), ...parseRunProps(rPrEl, this.ctx.theme) };
    if (props.hidden) return;
    const marks = runMarks(props, base, link);
    const push = (n: JSONContent) => pieces[pieces.length - 1].push(n);
    const pushText = (text: string) => {
      if (!text) return;
      push(marks.length ? { type: 'text', text: props.caps ? text.toUpperCase() : text, marks } : { type: 'text', text: props.caps ? text.toUpperCase() : text });
    };
    for (const c of children(r)) {
      switch (c.localName) {
        case 'fldChar': {
          const t = attr(c, 'fldCharType');
          if (t === 'begin') {
            this.fieldDepth++;
            this.fieldInstr = '';
            this.fieldShowResult = false;
          } else if (t === 'separate') {
            this.fieldShowResult = true;
          } else if (t === 'end') {
            this.fieldDepth = Math.max(0, this.fieldDepth - 1);
            this.fieldShowResult = true;
          }
          break;
        }
        case 'instrText':
          this.fieldInstr += c.textContent ?? '';
          break;
        case 't':
          if (this.fieldDepth > 0 && !this.fieldShowResult) break;
          pushText(c.textContent ?? '');
          break;
        case 'tab':
          pushText('\t');
          break;
        case 'br':
        case 'cr': {
          const type = attr(c, 'type');
          if (type === 'page') pieces.push([]);
          else push({ type: 'hardBreak' });
          break;
        }
        case 'noBreakHyphen':
          pushText('‑');
          break;
        case 'softHyphen':
          pushText('­');
          break;
        case 'sym': {
          const code = attr(c, 'char');
          if (code) pushText(String.fromCharCode(parseInt(code, 16) & 0xffff));
          break;
        }
        case 'footnoteReference':
        case 'endnoteReference': {
          const id = attr(c, 'id') ?? '';
          const isEnd = c.localName === 'endnoteReference';
          const text = (isEnd ? this.ctx.endnotes : this.ctx.footnotes).get(id) ?? '';
          push({ type: 'footnote', attrs: { text, kind: isEnd ? 'endnote' : 'footnote' } });
          break;
        }
        case 'drawing':
          await this.drawing(c, push);
          break;
        case 'pict': {
          const imagedata = descendants(c, 'imagedata')[0];
          const rid = attr(imagedata, 'id');
          if (rid) {
            const img = await this.image(rid, null, null, '');
            if (img) push(img);
          } else if (descendants(c, 'txbxContent').length) {
            this.ctx.warnings.add('Los cuadros de texto se han convertido en texto normal.');
            pushText(descendants(c, 't').map((t) => t.textContent ?? '').join(''));
          }
          break;
        }
        case 'object':
          this.ctx.warnings.add('Los objetos incrustados (OLE) no se pueden importar.');
          break;
        case 'AlternateContent': {
          const fallback = child(c, 'Fallback') ?? child(c, 'Choice');
          if (fallback) {
            const fake = { localName: 'r' } as Element;
            void fake;
            for (const cc of children(fallback)) {
              if (cc.localName === 'drawing') await this.drawing(cc, push);
              if (cc.localName === 'pict') {
                const rid = attr(descendants(cc, 'imagedata')[0], 'id');
                if (rid) {
                  const img = await this.image(rid, null, null, '');
                  if (img) push(img);
                }
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private async drawing(d: Element, push: (n: JSONContent) => void) {
    const graphicData = descendants(d, 'graphicData')[0];
    const uri = attr(graphicData, 'uri') ?? '';
    if (uri.includes('/chart')) {
      this.ctx.warnings.add('Los gráficos de Word no se pueden editar: no se han importado.');
      return;
    }
    if (uri.includes('/diagram')) {
      this.ctx.warnings.add('Los diagramas SmartArt no se han importado.');
      return;
    }
    const txbx = descendants(d, 'txbxContent')[0];
    if (txbx) {
      this.ctx.warnings.add('Los cuadros de texto se han convertido en texto normal.');
      const text = children(txbx, 'p')
        .map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join(''))
        .filter(Boolean)
        .join(' · ');
      if (text) push({ type: 'text', text });
      return;
    }
    const blip = descendants(d, 'blip')[0];
    const rid = attr(blip, 'embed');
    if (!rid) {
      if (descendants(d, 'wsp').length) this.ctx.warnings.add('Las formas de dibujo de Word no se han importado.');
      return;
    }
    const extent = descendants(d, 'extent')[0];
    const cx = attrNum(extent, 'cx');
    const docPr = descendants(d, 'docPr')[0];
    const alt = attr(docPr, 'descr') ?? attr(docPr, 'title') ?? '';
    const img = await this.image(rid, cx ? Math.round(emuToPx(cx)) : null, null, alt);
    if (img) push(img);
  }

  private async image(rid: string, width: number | null, _height: number | null, alt: string): Promise<JSONContent | null> {
    const rel = this.rels.get(rid);
    if (!rel) return null;
    if (rel.external) {
      this.ctx.warnings.add('Las imágenes vinculadas externamente no se cargan por privacidad.');
      return null;
    }
    const file = this.ctx.zip.file(rel.target);
    if (!file) return null;
    const ext = rel.target.split('.').pop() ?? '';
    const mime = mimeFromExtension(ext);
    if (!BROWSER_IMAGES.has(mime)) {
      this.ctx.warnings.add(`Hay imágenes en formato ${ext.toUpperCase()} que el navegador no puede mostrar; no se han importado.`);
      return null;
    }
    const bytes = await file.async('uint8array');
    return { type: 'image', attrs: { src: `data:${mime};base64,${bytesToBase64(bytes)}`, alt, title: null, width, align: 'left' } };
  }

  private async table(tbl: Element): Promise<JSONContent> {
    const grid = children(child(tbl, 'tblGrid'), 'gridCol').map((g) => Math.round(twipToPx(attrNum(g, 'w') ?? 0)));
    const rowsEl = children(tbl, 'tr');
    // Celdas por fila con su columna de inicio (para resolver vMerge)
    type Cell = { el: Element; col: number; span: number; vmerge: 'restart' | 'continue' | null; header: boolean };
    const rows: Cell[][] = rowsEl.map((tr) => {
      const header = !!path(tr, 'trPr', 'tblHeader');
      let col = 0;
      const cells: Cell[] = [];
      const gridBefore = attrNum(path(tr, 'trPr', 'gridBefore'), 'val') ?? 0;
      col += gridBefore;
      const tcs = children(tr).flatMap((x) => (x.localName === 'tc' ? [x] : x.localName === 'sdt' ? children(child(x, 'sdtContent'), 'tc') : []));
      for (const tc of tcs) {
        const tcPr = child(tc, 'tcPr');
        const span = attrNum(child(tcPr, 'gridSpan'), 'val') ?? 1;
        const vm = child(tcPr, 'vMerge');
        const vmerge = vm ? (attr(vm, 'val') === 'restart' ? 'restart' : 'continue') : null;
        cells.push({ el: tc, col, span, vmerge, header });
        col += span;
      }
      return cells;
    });
    const content: JSONContent[] = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const rowCells: JSONContent[] = [];
      for (const cell of rows[ri]) {
        if (cell.vmerge === 'continue') continue;
        let rowspan = 1;
        if (cell.vmerge === 'restart') {
          for (let rj = ri + 1; rj < rows.length; rj++) {
            const below = rows[rj].find((c) => c.col === cell.col);
            if (below?.vmerge === 'continue') rowspan++;
            else break;
          }
        }
        const tcPr = child(cell.el, 'tcPr');
        const fill = attr(child(tcPr, 'shd'), 'fill');
        const valign = attr(child(tcPr, 'vAlign'), 'val');
        const colwidth = grid.length ? grid.slice(cell.col, cell.col + cell.span) : null;
        const inner = await this.blocks(cell.el);
        rowCells.push({
          type: cell.header ? 'tableHeader' : 'tableCell',
          attrs: {
            colspan: cell.span,
            rowspan,
            colwidth: colwidth && colwidth.every((w) => w > 0) ? colwidth : null,
            backgroundColor: fill && /^[0-9a-f]{6}$/i.test(fill) ? `#${fill.toLowerCase()}` : null,
            verticalAlign: valign === 'center' ? 'middle' : valign === 'bottom' ? 'bottom' : null,
          },
          content: inner.length ? inner.map((b) => (b.type === 'pageBreak' ? { type: 'paragraph' } : b)) : [{ type: 'paragraph' }],
        });
      }
      if (rowCells.length) content.push({ type: 'tableRow', content: rowCells });
    }
    return { type: 'table', content };
  }
}

function paperFromSize(wMm: number, hMm: number): { size: PaperSize; orientation: 'portrait' | 'landscape' } {
  const portraitW = Math.min(wMm, hMm);
  const portraitH = Math.max(wMm, hMm);
  const orientation = wMm > hMm ? 'landscape' : 'portrait';
  const candidates: [PaperSize, number, number][] = [
    ['A4', 210, 297],
    ['Letter', 215.9, 279.4],
    ['Legal', 215.9, 355.6],
    ['A5', 148, 210],
    ['A3', 297, 420],
  ];
  let best: PaperSize = 'A4';
  let bestD = Infinity;
  for (const [name, w, h] of candidates) {
    const d = Math.abs(w - portraitW) + Math.abs(h - portraitH);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return { size: best, orientation };
}

async function headerFooterText(ctx: DocxContext, rid: string | null): Promise<{ text: string; align: 'left' | 'center' | 'right' } | null> {
  if (!rid) return null;
  const rel = ctx.rels.get(rid);
  if (!rel) return null;
  const doc = await readXml(ctx.zip, rel.target);
  if (!doc) return null;
  let align: 'left' | 'center' | 'right' = 'center';
  const lines: string[] = [];
  for (const p of descendants(doc, 'p')) {
    let text = '';
    let instr = '';
    let inField = false;
    let showResult = true;
    const jc = attr(path(p, 'pPr', 'jc'), 'val');
    for (const el of descendants(p, '*')) {
      if (el.localName === 'fldSimple') {
        const i = (attr(el, 'instr') ?? '').trim().toUpperCase();
        if (i.startsWith('NUMPAGES') || i.startsWith('SECTIONPAGES')) text += '{pages}';
        else if (i.startsWith('PAGE')) text += '{page}';
      } else if (el.localName === 'fldChar') {
        const t = attr(el, 'fldCharType');
        if (t === 'begin') {
          inField = true;
          instr = '';
          showResult = false;
        } else if (t === 'separate') {
          const i = instr.trim().toUpperCase();
          if (i.startsWith('NUMPAGES') || i.startsWith('SECTIONPAGES')) text += '{pages}';
          else if (i.startsWith('PAGE')) text += '{page}';
          else showResult = true;
        } else if (t === 'end') {
          inField = false;
          showResult = true;
        }
      } else if (el.localName === 'instrText') {
        instr += el.textContent ?? '';
      } else if (el.localName === 't') {
        const inFldSimple = el.closest?.('fldSimple');
        if (inFldSimple) continue;
        if (!inField || showResult) text += el.textContent ?? '';
      } else if (el.localName === 'tab') {
        text += ' ';
      }
    }
    if (text.trim()) {
      lines.push(text.trim());
      if (jc === 'left' || jc === 'start') align = 'left';
      else if (jc === 'right' || jc === 'end') align = 'right';
    }
  }
  if (descendants(doc, 'drawing').length) ctx.warnings.add('Las imágenes de encabezados y pies de página no se conservan.');
  return lines.length ? { text: lines.join(' — '), align } : null;
}

async function pageSettings(ctx: DocxContext, sectPr: Element | null): Promise<PageSettings> {
  const page: PageSettings = structuredClone(DEFAULT_PAGE);
  if (!sectPr) return page;
  const pgSz = child(sectPr, 'pgSz');
  const w = attrNum(pgSz, 'w');
  const h = attrNum(pgSz, 'h');
  if (w && h) {
    const res = paperFromSize(pxToMm(twipToPx(w)), pxToMm(twipToPx(h)));
    page.size = res.size;
    page.orientation = attr(pgSz, 'orient') === 'landscape' || res.orientation === 'landscape' ? 'landscape' : 'portrait';
  }
  const mar = child(sectPr, 'pgMar');
  if (mar) {
    const mm = (v: number | null, d: number) => (v !== null ? Math.round(pxToMm(twipToPx(Math.abs(v))) * 10) / 10 : d);
    page.margins = {
      top: mm(attrNum(mar, 'top'), page.margins.top),
      right: mm(attrNum(mar, 'right'), page.margins.right),
      bottom: mm(attrNum(mar, 'bottom'), page.margins.bottom),
      left: mm(attrNum(mar, 'left'), page.margins.left),
    };
  }
  const cols = attrNum(child(sectPr, 'cols'), 'num');
  if (cols && cols > 1) page.columns = Math.min(3, cols) as 2 | 3;
  const space = attrNum(child(sectPr, 'cols'), 'space');
  if (space) page.columnGap = Math.round(pxToMm(twipToPx(space)));
  page.differentFirstPage = !!child(sectPr, 'titlePg');
  const refs = (tag: string) => children(sectPr, tag);
  const pick = (tag: string) => {
    const all = refs(tag);
    return attr(all.find((r) => attr(r, 'type') === 'default') ?? all[0], 'id');
  };
  const header = await headerFooterText(ctx, pick('headerReference'));
  if (header) page.header = header;
  const footer = await headerFooterText(ctx, pick('footerReference'));
  if (footer) page.footer = footer;
  return page;
}

function toStyleDef(r: RunProps): TextStyleDef {
  const out: TextStyleDef = {};
  if (r.fontFamily) out.fontFamily = r.fontFamily;
  if (r.fontSize) out.fontSize = r.fontSize;
  if (r.color) out.color = r.color;
  if (r.bold !== undefined) out.bold = r.bold;
  if (r.italic !== undefined) out.italic = r.italic;
  return out;
}

/** Importa un archivo DOCX al modelo editable de Rounded Scribe. */
export async function importDocx(bytes: Uint8Array): Promise<{ content: WriterContent; warnings: string[] }> {
  const entries = inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const warnings = new Set<string>();
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name))) warnings.add('El documento contiene macros: se han descartado y no se ejecutarán.');

  const rootRels = await readRels(zip, '');
  const mainRel = Array.from(rootRels.values()).find((r) => r.type === 'officeDocument');
  const mainPart = mainRel?.target ?? 'word/document.xml';
  const docXml = await readXml(zip, mainPart);
  if (!docXml) throw new FileFormatError('El archivo no contiene un documento de Word (falta word/document.xml).');
  const rels = await readRels(zip, mainPart);
  const theme = await loadTheme(zip, rels);
  const st = await loadStyles(zip, rels, theme);
  const ctx: DocxContext = {
    zip,
    rels,
    styles: st.styles,
    defaultRun: st.defaultRun,
    defaultPara: st.defaultPara,
    defaultParaStyle: st.defaultParaStyle ?? (st.styles.has('Normal') ? 'Normal' : undefined),
    numbering: await loadNumbering(zip, rels),
    theme,
    footnotes: await loadNotes(zip, rels, 'footnotes'),
    endnotes: await loadNotes(zip, rels, 'endnotes'),
    warnings,
  };
  if (Array.from(rels.values()).some((r) => r.type === 'comments')) warnings.add('Los comentarios del documento todavía no se importan.');

  const bodyRun: RunProps = { ...ctx.defaultRun, ...effectiveRun(ctx, ctx.defaultParaStyle) };
  const body = child(docXml.documentElement, 'body');
  if (!body) throw new FileFormatError('El documento de Word no tiene cuerpo.');
  const parser = new BodyParser(ctx, rels, bodyRun);
  const blocks = await parser.blocks(body);

  const styles: DocumentStyles = {
    body: {
      ...toStyleDef(bodyRun),
      lineHeight: { ...ctx.defaultPara, ...effectivePara(ctx, ctx.defaultParaStyle) }.lineHeight,
      spaceAfter: (() => {
        const v = { ...ctx.defaultPara, ...effectivePara(ctx, ctx.defaultParaStyle) }.spaceAfter;
        return v !== undefined ? v / 20 : undefined;
      })(),
    },
    headings: {},
  };
  for (let lvl = 1 as 1 | 2 | 3 | 4 | 5 | 6; lvl <= 6; lvl = (lvl + 1) as any) {
    const style = Array.from(ctx.styles.values()).find((s) => s.type === 'paragraph' && headingLevel(ctx, s.id, {}) === lvl && /heading|t[ií]tulo/i.test(s.name) && s.name !== 'title');
    if (style) {
      const def = toStyleDef(effectiveRun(ctx, style.id));
      if (Object.keys(def).length) styles.headings![lvl] = def;
    }
  }

  const content = createEmptyDocument({ type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] });
  content.page = await pageSettings(ctx, child(body, 'sectPr'));
  content.styles = styles;
  const lang = attr(path(docXml.documentElement, 'body'), 'lang');
  if (lang) content.language = lang;
  return { content, warnings: Array.from(warnings) };
}
