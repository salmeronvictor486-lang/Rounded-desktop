import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';
import { inspectZip } from '@/core/files/zipGuard';
import { FileFormatError } from '@/core/files/errors';
import { attr, attrNum, child, children, descendants, parseXml, path, relAttr } from '@/core/files/xml';
import { bytesToBase64, mimeFromExtension } from '@/core/files/download';
import { emuToPx } from '@/core/util/units';
import { createId } from '@/core/util/id';
import { THEMES } from '../themes';
import type { Background, Presentation, ShapeKind, Slide, SlideElement, TableCellData, Theme, TransitionType } from '../model';

type Rels = Map<string, { type: string; target: string; external: boolean }>;

interface Part {
  name: string;
  doc: Document;
  rels: Rels;
}

interface Ctx {
  zip: JSZip;
  scheme: Record<string, string>;
  fonts: { major: string; minor: string };
  warnings: Set<string>;
  masterText: { title: TextDefaults; body: TextDefaults[]; other: TextDefaults };
}

interface TextDefaults {
  size?: number; // px
  color?: string;
  font?: string;
  bold?: boolean;
  /** Viñeta definida por el estilo (true), anulada (false) o heredada (undefined). */
  bullet?: boolean;
}

const BROWSER_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp']);

function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function loadPart(zip: JSZip, name: string): Promise<Part | null> {
  const f = zip.file(name);
  if (!f) return null;
  const doc = parseXml(await f.async('string'), name);
  const dir = name.split('/');
  const file = dir.pop()!;
  const relsFile = zip.file([...dir, '_rels', `${file}.rels`].join('/'));
  const rels: Rels = new Map();
  if (relsFile) {
    const rd = parseXml(await relsFile.async('string'), 'rels');
    for (const r of children(rd.documentElement, 'Relationship')) {
      const external = attr(r, 'TargetMode') === 'External';
      rels.set(attr(r, 'Id') ?? '', { type: (attr(r, 'Type') ?? '').split('/').pop() ?? '', target: external ? attr(r, 'Target') ?? '' : resolveTarget(name, attr(r, 'Target') ?? ''), external });
    }
  }
  return { name, doc, rels };
}

function relOfType(rels: Rels, type: string) {
  return Array.from(rels.values()).find((r) => r.type === type);
}

// ---------- Colores ----------

function applyMods(hex: string, el: Element): string {
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);
  for (const m of children(el)) {
    const v = (attrNum(m, 'val') ?? 0) / 100000;
    if (m.localName === 'lumMod') [r, g, b] = [r * v, g * v, b * v];
    else if (m.localName === 'lumOff') [r, g, b] = [r + 255 * v, g + 255 * v, b + 255 * v];
    else if (m.localName === 'tint') [r, g, b] = [r + (255 - r) * (1 - v), g + (255 - g) * (1 - v), b + (255 - b) * (1 - v)];
    else if (m.localName === 'shade') [r, g, b] = [r * v, g * v, b * v];
  }
  return [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}

/** Color de un elemento con *Fill o color (srgbClr, schemeClr, sysClr, prstClr). */
function readColor(el: Element | null, ctx: Ctx): string | null {
  if (!el) return null;
  const srgb = child(el, 'srgbClr');
  if (srgb) return `#${applyMods(attr(srgb, 'val') ?? '000000', srgb).toLowerCase()}`;
  const scheme = child(el, 'schemeClr');
  if (scheme) {
    const key = attr(scheme, 'val') ?? 'tx1';
    const base = ctx.scheme[key] ?? '000000';
    return `#${applyMods(base, scheme).toLowerCase()}`;
  }
  const sys = child(el, 'sysClr');
  if (sys) return `#${applyMods(attr(sys, 'lastClr') ?? (attr(sys, 'val') === 'window' ? 'FFFFFF' : '000000'), sys).toLowerCase()}`;
  const prst = child(el, 'prstClr');
  if (prst) {
    const map: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00', gray: '808080' };
    return `#${(map[attr(prst, 'val') ?? ''] ?? '000000').toLowerCase()}`;
  }
  return null;
}

function alphaOf(el: Element | null): number | undefined {
  const c = el ? children(el)[0] : null;
  const a = c ? child(c, 'alpha') : null;
  const v = attrNum(a, 'val');
  return v !== null ? v / 100000 : undefined;
}

// ---------- Tema ----------

async function loadTheme(zip: JSZip, pres: Part): Promise<{ scheme: Record<string, string>; fonts: { major: string; minor: string } }> {
  const scheme: Record<string, string> = { dk1: '000000', lt1: 'FFFFFF', dk2: '1F497D', lt2: 'EEECE1', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1' };
  const fonts = { major: 'Calibri Light', minor: 'Calibri' };
  // El tema cuelga del patrón
  const masterRel = relOfType(pres.rels, 'slideMaster');
  const master = masterRel ? await loadPart(zip, masterRel.target) : null;
  const themeRel = master ? relOfType(master.rels, 'theme') : relOfType(pres.rels, 'theme');
  const theme = themeRel ? await loadPart(zip, themeRel.target) : null;
  if (theme) {
    const cs = descendants(theme.doc, 'clrScheme')[0];
    for (const c of children(cs)) {
      const srgb = child(c, 'srgbClr');
      const sys = child(c, 'sysClr');
      const v = srgb ? attr(srgb, 'val') : sys ? attr(sys, 'lastClr') : null;
      if (v) scheme[c.localName] = v.toUpperCase();
    }
    const major = attr(child(descendants(theme.doc, 'majorFont')[0], 'latin'), 'typeface');
    const minor = attr(child(descendants(theme.doc, 'minorFont')[0], 'latin'), 'typeface');
    if (major) fonts.major = major;
    if (minor) fonts.minor = minor;
  }
  Object.assign(scheme, { tx1: scheme.dk1, bg1: scheme.lt1, tx2: scheme.dk2, bg2: scheme.lt2 });
  return { scheme, fonts };
}

function readTextDefaults(lvl: Element | null, ctx: Ctx): TextDefaults {
  const d = child(lvl, 'defRPr');
  const out: TextDefaults = {};
  const sz = attrNum(d, 'sz');
  if (sz) out.size = (sz / 100) * (96 / 72);
  const col = readColor(child(d, 'solidFill'), ctx);
  if (col) out.color = col;
  const latin = attr(child(d, 'latin'), 'typeface');
  if (latin) out.font = latin.startsWith('+mj') ? ctx.fonts.major : latin.startsWith('+mn') ? ctx.fonts.minor : latin;
  if (attr(d, 'b') === '1') out.bold = true;
  if (child(lvl, 'buChar') || child(lvl, 'buAutoNum')) out.bullet = true;
  if (child(lvl, 'buNone')) out.bullet = false;
  return out;
}

// ---------- Geometría ----------

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flipH: boolean;
  flipV: boolean;
}

function readXfrm(xfrm: Element | null): Xfrm | null {
  if (!xfrm) return null;
  const off = child(xfrm, 'off');
  const ext = child(xfrm, 'ext');
  if (!off || !ext) return null;
  return {
    x: emuToPx(attrNum(off, 'x') ?? 0),
    y: emuToPx(attrNum(off, 'y') ?? 0),
    w: emuToPx(attrNum(ext, 'cx') ?? 0),
    h: emuToPx(attrNum(ext, 'cy') ?? 0),
    rot: (attrNum(xfrm, 'rot') ?? 0) / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  };
}

/** Transformación de grupo: mapea coordenadas hijas a coordenadas de la diapositiva. */
interface GroupTx {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

function applyGroup(x: Xfrm, g: GroupTx | null): Xfrm {
  if (!g) return x;
  return { ...x, x: g.ox + (x.x - g.cx) * g.sx, y: g.oy + (x.y - g.cy) * g.sy, w: x.w * g.sx, h: x.h * g.sy };
}

const PRESET_MAP: Record<string, ShapeKind> = {
  rect: 'rect', roundRect: 'roundRect', snipRoundRect: 'roundRect', round2SameRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'triangle',
  diamond: 'diamond', pentagon: 'chevron', homePlate: 'chevron', hexagon: 'hexagon', octagon: 'hexagon', star5: 'star', star4: 'star', star6: 'star',
  rightArrow: 'arrowRight', leftArrow: 'arrowLeft', chevron: 'chevron', wedgeRectCallout: 'callout', wedgeRoundRectCallout: 'callout', wedgeEllipseCallout: 'callout',
  heart: 'heart', cloud: 'cloud', cloudCallout: 'cloud', flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect', flowChartDecision: 'diamond', plaque: 'roundRect',
};

// ---------- Texto ----------

function paragraphsToContent(txBody: Element | null, ctx: Ctx, defaults: TextDefaults, role: 'title' | 'body' | 'other'): JSONContent | null {
  if (!txBody) return null;
  const listStyle = child(txBody, 'lstStyle');
  const lstDefaults: Record<number, TextDefaults> = {};
  for (let i = 1; i <= 9; i++) {
    const l = child(listStyle, `lvl${i}pPr`);
    if (l) lstDefaults[i - 1] = readTextDefaults(l, ctx);
  }
  const blocks: JSONContent[] = [];
  let list: JSONContent | null = null;
  let hasText = false;
  for (const p of children(txBody, 'p')) {
    const pPr = child(p, 'pPr');
    const lvl = attrNum(pPr, 'lvl') ?? 0;
    const algn = attr(pPr, 'algn');
    const align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : algn === 'l' ? 'left' : null;
    const levelDefaults = role === 'body' ? ctx.masterText.body[lvl] ?? ctx.masterText.body[0] ?? {} : role === 'title' ? ctx.masterText.title : ctx.masterText.other;
    const base: TextDefaults = { ...levelDefaults, ...defaults, ...(lstDefaults[lvl] ?? {}) };
    const content: JSONContent[] = [];
    for (const r of children(p)) {
      if (r.localName === 'br') {
        content.push({ type: 'hardBreak' });
        continue;
      }
      if (r.localName !== 'r' && r.localName !== 'fld') continue;
      const text = child(r, 't')?.textContent ?? '';
      if (!text) continue;
      hasText = true;
      const rPr = child(r, 'rPr');
      const marks: JSONContent['marks'] = [];
      const b = attr(rPr, 'b');
      if (b === '1' || (b === null && base.bold)) marks.push({ type: 'bold' });
      if (attr(rPr, 'i') === '1') marks.push({ type: 'italic' });
      const u = attr(rPr, 'u');
      if (u && u !== 'none') marks.push({ type: 'underline' });
      const strike = attr(rPr, 'strike');
      if (strike && strike !== 'noStrike') marks.push({ type: 'strike' });
      const ts: Record<string, string> = {};
      const sz = attrNum(rPr, 'sz');
      const size = sz ? (sz / 100) * (96 / 72) : base.size;
      if (size) ts.fontSize = `${Math.round(size)}px`;
      const color = readColor(child(rPr, 'solidFill'), ctx) ?? base.color;
      if (color) ts.color = color;
      const latin = attr(child(rPr, 'latin'), 'typeface');
      const font = latin ? (latin.startsWith('+mj') ? ctx.fonts.major : latin.startsWith('+mn') ? ctx.fonts.minor : latin) : base.font;
      if (font) ts.fontFamily = font;
      if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts });
      const hl = readColor(child(rPr, 'highlight'), ctx);
      if (hl) marks.push({ type: 'highlight', attrs: { color: hl } });
      const link = child(rPr, 'hlinkClick');
      void link;
      content.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
    }
    const para: JSONContent = { type: 'paragraph', attrs: { textAlign: align }, ...(content.length ? { content } : {}) };
    const bullet = child(pPr, 'buChar') || child(pPr, 'buAutoNum');
    const noBullet = child(pPr, 'buNone');
    const isList = !noBullet && content.length > 0 && (!!bullet || base.bullet === true);
    if (isList) {
      const ordered = !!child(pPr, 'buAutoNum');
      if (!list || (list.type === 'orderedList') !== ordered) {
        list = ordered ? { type: 'orderedList', attrs: { start: 1 }, content: [] } : { type: 'bulletList', content: [] };
        blocks.push(list);
      }
      list.content!.push({ type: 'listItem', content: [para] });
    } else {
      list = null;
      blocks.push(para);
    }
  }
  if (!hasText) return null;
  return { type: 'doc', content: blocks };
}

// ---------- Elementos ----------

interface PlaceholderInfo {
  type: string;
  idx: string | null;
  xfrm: Xfrm | null;
  defaults: TextDefaults;
  bodyPr: Element | null;
}

function placeholderOf(sp: Element): { type: string; idx: string | null } | null {
  const ph = descendants(child(sp, 'nvSpPr') ?? child(sp, 'nvPicPr'), 'ph')[0];
  if (!ph) return null;
  return { type: attr(ph, 'type') ?? 'body', idx: attr(ph, 'idx') };
}

function collectPlaceholders(part: Part | null, ctx: Ctx): PlaceholderInfo[] {
  if (!part) return [];
  const out: PlaceholderInfo[] = [];
  for (const sp of descendants(part.doc, 'sp')) {
    const ph = placeholderOf(sp);
    if (!ph) continue;
    const firstLvl = path(child(sp, 'txBody'), 'lstStyle', 'lvl1pPr');
    out.push({ ...ph, xfrm: readXfrm(path(sp, 'spPr', 'xfrm')), defaults: firstLvl ? readTextDefaults(firstLvl, ctx) : {}, bodyPr: path(sp, 'txBody', 'bodyPr') });
  }
  return out;
}

function findPh(list: PlaceholderInfo[], ph: { type: string; idx: string | null }): PlaceholderInfo | undefined {
  const norm = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : t);
  return list.find((p) => ph.idx !== null && p.idx === ph.idx) ?? list.find((p) => norm(p.type) === norm(ph.type));
}

async function image(ctx: Ctx, rels: Rels, rid: string | null): Promise<string | null> {
  if (!rid) return null;
  const rel = rels.get(rid);
  if (!rel) return null;
  if (rel.external) {
    ctx.warnings.add('Las imágenes vinculadas externamente no se cargan por privacidad.');
    return null;
  }
  const f = ctx.zip.file(rel.target);
  if (!f) return null;
  const ext = rel.target.split('.').pop() ?? '';
  const mime = mimeFromExtension(ext);
  if (!BROWSER_IMAGES.has(mime)) {
    ctx.warnings.add(`Hay imágenes en formato ${ext.toUpperCase()} que el navegador no puede mostrar; no se han importado.`);
    return null;
  }
  return `data:${mime};base64,${bytesToBase64(await f.async('uint8array'))}`;
}

async function readBackground(el: Element | null, rels: Rels, ctx: Ctx): Promise<Background | null> {
  const bgPr = path(el, 'cSld', 'bg', 'bgPr');
  const bgRef = path(el, 'cSld', 'bg', 'bgRef');
  if (bgRef) {
    const c = readColor(bgRef, ctx);
    return c ? { type: 'solid', color: c } : null;
  }
  if (!bgPr) return null;
  const solid = child(bgPr, 'solidFill');
  if (solid) {
    const c = readColor(solid, ctx);
    return c ? { type: 'solid', color: c } : null;
  }
  const grad = child(bgPr, 'gradFill');
  if (grad) {
    const stops = descendants(grad, 'gs').map((gs) => readColor(gs, ctx)).filter(Boolean) as string[];
    const ang = (attrNum(child(grad, 'lin'), 'ang') ?? 5400000) / 60000;
    if (stops.length >= 2) return { type: 'gradient', from: stops[0], to: stops[stops.length - 1], angle: (ang + 90) % 360 };
  }
  const blip = descendants(child(bgPr, 'blipFill'), 'blip')[0];
  if (blip) {
    const src = await image(ctx, rels, attr(blip, 'embed'));
    if (src) return { type: 'image', src, fit: 'cover' };
  }
  return null;
}

async function readShapes(container: Element, part: Part, ctx: Ctx, layoutPh: PlaceholderInfo[], masterPh: PlaceholderInfo[], group: GroupTx | null, out: SlideElement[]) {
  for (const el of children(container)) {
    switch (el.localName) {
      case 'sp': {
        const ph = placeholderOf(el);
        const inherited = ph ? findPh(layoutPh, ph) ?? findPh(masterPh, ph) : undefined;
        const inheritedMaster = ph ? findPh(masterPh, ph) : undefined;
        let x = readXfrm(path(el, 'spPr', 'xfrm')) ?? inherited?.xfrm ?? inheritedMaster?.xfrm ?? null;
        if (!x) continue;
        x = applyGroup(x, group);
        const spPr = child(el, 'spPr');
        const prst = attr(child(spPr, 'prstGeom'), 'prst');
        const custom = !!child(spPr, 'custGeom');
        const fillEl = child(spPr, 'solidFill');
        const noFill = !!child(spPr, 'noFill');
        const fill = fillEl ? readColor(fillEl, ctx) : null;
        const gradFill = child(spPr, 'gradFill');
        const gradColor = gradFill ? readColor(descendants(gradFill, 'gs')[0] ?? null, ctx) : null;
        const ln = child(spPr, 'ln');
        const stroke = ln && !child(ln, 'noFill') ? readColor(child(ln, 'solidFill'), ctx) : null;
        const strokeWidth = ln ? Math.max(0, emuToPx(attrNum(ln, 'w') ?? 9525)) : 0;
        const role: 'title' | 'body' | 'other' = ph ? (/title/i.test(ph.type) ? 'title' : ph.type === 'body' || ph.type === 'subTitle' || ph.type === 'obj' ? 'body' : 'other') : 'other';
        const defaults = { ...(inheritedMaster?.defaults ?? {}), ...(inherited?.defaults ?? {}) };
        const content = paragraphsToContent(child(el, 'txBody'), ctx, defaults, role);
        if (ph && ['dt', 'sldNum', 'ftr'].includes(ph.type) && !content) continue;
        const bodyPr = path(el, 'txBody', 'bodyPr') ?? inherited?.bodyPr ?? null;
        const anchor = attr(bodyPr, 'anchor');
        const vAlign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
        if (custom) ctx.warnings.add('Algunas formas personalizadas se han simplificado a rectángulos.');
        const kind: ShapeKind | null = prst ? PRESET_MAP[prst] ?? null : custom ? 'rect' : null;
        if (prst && !PRESET_MAP[prst] && prst !== 'line' && prst !== 'straightConnector1') ctx.warnings.add(`Algunas formas (${prst}) se han aproximado.`);
        const base = { id: createId('e'), x: x.x, y: x.y, w: x.w, h: x.h, rotation: x.rot };
        const opacity = alphaOf(fillEl);
        if (prst === 'line' || prst === 'straightConnector1') {
          out.push({ ...base, type: 'line', stroke: stroke ?? '#000000', strokeWidth: Math.max(1, strokeWidth), flipH: x.flipH, flipV: x.flipV, arrowEnd: !!child(ln, 'tailEnd') && attr(child(ln, 'tailEnd'), 'type') !== 'none', arrowStart: !!child(ln, 'headEnd') && attr(child(ln, 'headEnd'), 'type') !== 'none' });
          break;
        }
        const visibleShape = !noFill && (fill || gradColor || (kind && kind !== 'rect')) || (stroke && strokeWidth > 0);
        if (visibleShape && kind) {
          out.push({ ...base, type: 'shape', shape: kind, fill: fill ?? gradColor ?? (noFill ? null : kind !== 'rect' ? ctx.scheme.accent1 ? `#${ctx.scheme.accent1.toLowerCase()}` : null : null), stroke: stroke, strokeWidth: stroke ? strokeWidth : 0, ...(content ? { content } : {}), vAlign, opacity });
          if (gradColor) ctx.warnings.add('Los rellenos degradados de formas se han simplificado a un color.');
        } else if (content) {
          out.push({ ...base, type: 'text', content, style: { vAlign, padding: 7, fill: null }, role: role === 'title' ? 'title' : role === 'body' ? 'body' : undefined });
        }
        break;
      }
      case 'pic': {
        let x = readXfrm(path(el, 'spPr', 'xfrm'));
        const ph = placeholderOf(el);
        if (!x && ph) x = findPh(layoutPh, ph)?.xfrm ?? findPh(masterPh, ph)?.xfrm ?? null;
        if (!x) continue;
        x = applyGroup(x, group);
        const blip = descendants(child(el, 'blipFill'), 'blip')[0];
        const src = await image(ctx, part.rels, attr(blip, 'embed'));
        if (!src) continue;
        const descr = attr(descendants(el, 'cNvPr')[0], 'descr') ?? '';
        const geom = attr(path(el, 'spPr', 'prstGeom'), 'prst');
        out.push({ id: createId('e'), type: 'image', x: x.x, y: x.y, w: x.w, h: x.h, rotation: x.rot, src, alt: descr, fit: 'fill', radius: geom === 'ellipse' ? Math.max(x.w, x.h) : undefined });
        break;
      }
      case 'graphicFrame': {
        const uri = attr(descendants(el, 'graphicData')[0], 'uri') ?? '';
        let x = readXfrm(child(el, 'xfrm'));
        if (!x) continue;
        x = applyGroup(x, group);
        if (uri.endsWith('/table')) {
          const tbl = descendants(el, 'tbl')[0];
          const widths = children(child(tbl, 'tblGrid'), 'gridCol').map((g) => attrNum(g, 'w') ?? 1);
          const total = widths.reduce((a, b) => a + b, 0) || 1;
          let merged = false;
          let fontSize = 18;
          const rows: TableCellData[][] = children(tbl, 'tr').map((tr) =>
            children(tr, 'tc').map((tc) => {
              if (attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1' || attr(tc, 'gridSpan') || attr(tc, 'rowSpan')) merged = true;
              const texts = children(child(tc, 'txBody'), 'p').map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join(''));
              const firstR = descendants(tc, 'rPr')[0];
              const sz = attrNum(firstR, 'sz');
              if (sz) fontSize = Math.round((sz / 100) * (96 / 72));
              const fillC = readColor(child(child(tc, 'tcPr'), 'solidFill'), ctx);
              const color = readColor(child(firstR ?? null, 'solidFill'), ctx);
              return { text: texts.join('\n'), bold: attr(firstR, 'b') === '1' || undefined, fill: fillC, color };
            }),
          );
          const firstRow = attr(child(tbl, 'tblPr'), 'firstRow') === '1';
          if (merged) ctx.warnings.add('Las celdas combinadas de tablas se han separado.');
          out.push({ id: createId('e'), type: 'table', x: x.x, y: x.y, w: x.w, h: x.h, rotation: 0, rows, colWidths: widths.map((w) => w / total), fontSize, headerRow: firstRow && !rows[0]?.some((c) => c.fill), borderColor: '#9ca3af', headerFill: `#${(ctx.scheme.accent1 ?? '4472C4').toLowerCase()}` });
        } else if (uri.includes('/chart')) {
          ctx.warnings.add('Los gráficos de PowerPoint no se pueden editar todavía y no se han importado.');
        } else if (uri.includes('/diagram')) {
          ctx.warnings.add('Los diagramas SmartArt no se han importado.');
        } else {
          ctx.warnings.add('Algunos objetos incrustados (OLE, vídeo) no se han importado.');
        }
        break;
      }
      case 'grpSp': {
        const gx = path(el, 'grpSpPr', 'xfrm');
        const off = child(gx, 'off');
        const ext = child(gx, 'ext');
        const choff = child(gx, 'chOff');
        const chext = child(gx, 'chExt');
        let tx: GroupTx | null = null;
        if (off && ext && choff && chext) {
          const cw = emuToPx(attrNum(chext, 'cx') ?? 1) || 1;
          const chh = emuToPx(attrNum(chext, 'cy') ?? 1) || 1;
          tx = { ox: emuToPx(attrNum(off, 'x') ?? 0), oy: emuToPx(attrNum(off, 'y') ?? 0), sx: emuToPx(attrNum(ext, 'cx') ?? 0) / cw, sy: emuToPx(attrNum(ext, 'cy') ?? 0) / chh, cx: emuToPx(attrNum(choff, 'x') ?? 0), cy: emuToPx(attrNum(choff, 'y') ?? 0) };
          if (group) {
            // Componer con el grupo padre
            tx = { ox: group.ox + (tx.ox - group.cx) * group.sx, oy: group.oy + (tx.oy - group.cy) * group.sy, sx: tx.sx * group.sx, sy: tx.sy * group.sy, cx: tx.cx, cy: tx.cy };
          }
        }
        await readShapes(el, part, ctx, layoutPh, masterPh, tx ?? group, out);
        break;
      }
      case 'cxnSp': {
        let x = readXfrm(path(el, 'spPr', 'xfrm'));
        if (!x) continue;
        x = applyGroup(x, group);
        const ln = path(el, 'spPr', 'ln');
        out.push({ id: createId('e'), type: 'line', x: x.x, y: x.y, w: x.w, h: x.h, rotation: x.rot, stroke: readColor(child(ln, 'solidFill'), ctx) ?? '#000000', strokeWidth: Math.max(1, emuToPx(attrNum(ln, 'w') ?? 12700)), flipH: x.flipH, flipV: x.flipV, arrowEnd: !!child(ln, 'tailEnd') && attr(child(ln, 'tailEnd'), 'type') !== 'none' });
        break;
      }
      case 'AlternateContent': {
        const fb = child(el, 'Fallback');
        if (fb) await readShapes(fb, part, ctx, layoutPh, masterPh, group, out);
        break;
      }
      default:
        break;
    }
  }
}

function transitionOf(doc: Document): { type: TransitionType; duration: number } {
  const tr = descendants(doc, 'transition')[0];
  if (!tr) return { type: 'none', duration: 0.5 };
  const kind = children(tr)[0]?.localName ?? '';
  const spd = attr(tr, 'spd');
  const dur = attrNum(tr, 'dur');
  const duration = dur ? dur / 1000 : spd === 'slow' ? 1 : spd === 'fast' ? 0.3 : 0.5;
  if (/fade|dissolve/.test(kind)) return { type: 'fade', duration };
  if (/push|wipe|cover|pull|split|reveal/.test(kind)) return { type: 'slide', duration };
  if (/zoom|cut|newsflash/.test(kind)) return { type: 'zoom', duration };
  return { type: kind ? 'fade' : 'none', duration };
}

/** Importa un PPTX al modelo editable de Rounded Stage. */
export async function importPptx(bytes: Uint8Array): Promise<{ content: Presentation; warnings: string[] }> {
  const entries = inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const warnings = new Set<string>();
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name))) warnings.add('La presentación contiene macros: se han descartado y no se ejecutarán.');
  if (entries.some((e) => e.name.startsWith('ppt/media/') && /\.(mp4|mov|wmv|avi|mp3|wav|m4a)$/i.test(e.name))) warnings.add('Los vídeos y audios incrustados no se importan.');
  const pres = await loadPart(zip, 'ppt/presentation.xml');
  if (!pres) throw new FileFormatError('El archivo no es una presentación de PowerPoint válida (falta ppt/presentation.xml).');
  const sldSz = descendants(pres.doc, 'sldSz')[0];
  const width = Math.round(emuToPx(attrNum(sldSz, 'cx') ?? 9144000));
  const height = Math.round(emuToPx(attrNum(sldSz, 'cy') ?? 5143500));
  const { scheme, fonts } = await loadTheme(zip, pres);
  const ctx: Ctx = { zip, scheme, fonts, warnings, masterText: { title: {}, body: [], other: {} } };

  const baseTheme: Theme = structuredClone(THEMES[0]);
  baseTheme.id = 'importado';
  baseTheme.name = 'Importado';
  baseTheme.colors = { bg: `#${scheme.lt1.toLowerCase()}`, text: `#${scheme.dk1.toLowerCase()}`, title: `#${scheme.dk1.toLowerCase()}`, accent: ['accent1', 'accent2', 'accent3', 'accent4'].map((a) => `#${(scheme[a] ?? '4472C4').toLowerCase()}`) };
  baseTheme.fonts = { heading: fonts.major, body: fonts.minor };
  baseTheme.background = { type: 'solid', color: `#${scheme.lt1.toLowerCase()}` };

  const slides: Slide[] = [];
  const sldIds = descendants(pres.doc, 'sldId');
  const masterCache = new Map<string, { part: Part; ph: PlaceholderInfo[]; bg: Background | null }>();
  let hasAnimations = false;
  for (const sldId of sldIds) {
    const rid = relAttr(sldId, 'id');
    const rel = rid ? pres.rels.get(rid) : undefined;
    if (!rel) continue;
    const part = await loadPart(zip, rel.target);
    if (!part) continue;
    const layoutRel = relOfType(part.rels, 'slideLayout');
    const layout = layoutRel ? await loadPart(zip, layoutRel.target) : null;
    const masterRel = layout ? relOfType(layout.rels, 'slideMaster') : null;
    let master = masterRel ? masterCache.get(masterRel.target) : undefined;
    if (masterRel && !master) {
      const mp = await loadPart(zip, masterRel.target);
      if (mp) {
        const txStyles = descendants(mp.doc, 'txStyles')[0];
        ctx.masterText = {
          title: readTextDefaults(path(txStyles, 'titleStyle', 'lvl1pPr'), ctx),
          body: [1, 2, 3, 4, 5].map((i) => readTextDefaults(path(txStyles, 'bodyStyle', `lvl${i}pPr`), ctx)),
          other: readTextDefaults(path(txStyles, 'otherStyle', 'lvl1pPr'), ctx),
        };
        master = { part: mp, ph: collectPlaceholders(mp, ctx), bg: await readBackground(mp.doc.documentElement, mp.rels, ctx) };
        masterCache.set(masterRel.target, master);
      }
    }
    const layoutPh = collectPlaceholders(layout, ctx);
    const elements: SlideElement[] = [];
    // Elementos fijos (no marcadores) del patrón y del diseño, si la diapositiva no los oculta
    const showMaster = attr(part.doc.documentElement, 'showMasterSp') !== '0';
    if (showMaster && master) {
      const tree = path(master.part.doc.documentElement, 'cSld', 'spTree');
      const statics = tree ? children(tree).filter((x) => !(x.localName === 'sp' && placeholderOf(x))) : [];
      const tmp = master.part.doc.createElement('spTree');
      statics.forEach((s) => tmp.appendChild(s.cloneNode(true)));
      await readShapes(tmp, master.part, ctx, [], [], null, elements);
    }
    if (layout && attr(layout.doc.documentElement, 'showMasterSp') !== '0') {
      const tree = path(layout.doc.documentElement, 'cSld', 'spTree');
      const statics = tree ? children(tree).filter((x) => !placeholderOf(x)) : [];
      const tmp = layout.doc.createElement('spTree');
      statics.forEach((s) => tmp.appendChild(s.cloneNode(true)));
      await readShapes(tmp, layout, ctx, [], [], null, elements);
    }
    const tree = path(part.doc.documentElement, 'cSld', 'spTree');
    if (tree) await readShapes(tree, part, ctx, layoutPh, master?.ph ?? [], null, elements);
    const bg = (await readBackground(part.doc.documentElement, part.rels, ctx)) ?? (layout ? await readBackground(layout.doc.documentElement, layout.rels, ctx) : null) ?? master?.bg ?? null;
    // Notas
    let notes = '';
    const notesRel = relOfType(part.rels, 'notesSlide');
    if (notesRel) {
      const np = await loadPart(zip, notesRel.target);
      if (np) {
        for (const sp of descendants(np.doc, 'sp')) {
          const ph = placeholderOf(sp);
          if (ph?.type === 'body') notes = children(child(sp, 'txBody'), 'p').map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join('')).join('\n').trim();
        }
      }
    }
    if (descendants(part.doc, 'timing').length && descendants(part.doc, 'par').length) hasAnimations = true;
    slides.push({
      id: createId('sl'),
      layout: 'blank',
      background: bg,
      elements,
      notes,
      transition: transitionOf(part.doc),
      hidden: attr(part.doc.documentElement, 'show') === '0' || undefined,
    });
  }
  if (hasAnimations) warnings.add('Las animaciones de PowerPoint no se importan; puedes añadir animaciones de entrada en Rounded Stage.');
  if (!slides.length) throw new FileFormatError('La presentación no contiene diapositivas.');
  return { content: { format: 'rounded-stage', version: 1, size: { width, height }, theme: baseTheme, slides }, warnings: Array.from(warnings) };
}
