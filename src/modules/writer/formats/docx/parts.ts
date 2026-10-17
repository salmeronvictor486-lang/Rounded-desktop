import type JSZip from 'jszip';
import { attr, attrNum, child, children, descendants, onOff, parseXml, path } from '@/core/files/xml';

/** Propiedades de carácter resueltas (unidades: pt para tamaños). */
export interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  background?: string;
  fontSize?: number;
  fontFamily?: string;
  vertAlign?: 'superscript' | 'subscript';
  caps?: boolean;
  hidden?: boolean;
}

export interface ParaProps {
  align?: 'left' | 'center' | 'right' | 'justify';
  indentLeft?: number; // twips
  firstLine?: number; // twips (negativo = francesa)
  spaceBefore?: number; // twips
  spaceAfter?: number; // twips
  lineHeight?: number; // múltiplo
  numId?: string;
  ilvl?: number;
  outlineLvl?: number;
  pageBreakBefore?: boolean;
}

export interface StyleDef {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  rPr: RunProps;
  pPr: ParaProps;
}

export interface NumLevel {
  format: string; // bullet, decimal, lowerLetter...
  start: number;
  text: string;
}

export interface DocxContext {
  zip: JSZip;
  rels: Map<string, { type: string; target: string; external: boolean }>;
  styles: Map<string, StyleDef>;
  defaultRun: RunProps;
  defaultPara: ParaProps;
  defaultParaStyle?: string;
  numbering: Map<string, Map<number, NumLevel>>;
  theme: { major?: string; minor?: string };
  footnotes: Map<string, string>;
  endnotes: Map<string, string>;
  warnings: Set<string>;
}

export async function readXml(zip: JSZip, name: string): Promise<Document | null> {
  const f = zip.file(name);
  if (!f) return null;
  return parseXml(await f.async('string'), name);
}

export function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export async function readRels(zip: JSZip, partName: string) {
  const dir = partName.split('/');
  const file = dir.pop()!;
  const relsName = [...dir, '_rels', `${file}.rels`].join('/');
  const doc = await readXml(zip, relsName);
  const map = new Map<string, { type: string; target: string; external: boolean }>();
  if (!doc) return map;
  for (const r of children(doc.documentElement, 'Relationship')) {
    const external = attr(r, 'TargetMode') === 'External';
    const target = attr(r, 'Target') ?? '';
    map.set(attr(r, 'Id') ?? '', {
      type: (attr(r, 'Type') ?? '').split('/').pop() ?? '',
      target: external ? target : resolveTarget(partName, target),
      external,
    });
  }
  return map;
}

function hexColor(v: string | null): string | undefined {
  if (!v || v === 'auto') return undefined;
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined;
}

export function parseRunProps(rPr: Element | null, theme: DocxContext['theme']): RunProps {
  const out: RunProps = {};
  if (!rPr) return out;
  const b = onOff(child(rPr, 'b'));
  if (b !== null) out.bold = b;
  const i = onOff(child(rPr, 'i'));
  if (i !== null) out.italic = i;
  const u = child(rPr, 'u');
  if (u) out.underline = (attr(u, 'val') ?? 'single') !== 'none';
  const st = onOff(child(rPr, 'strike')) ?? onOff(child(rPr, 'dstrike'));
  if (st !== null) out.strike = st;
  const color = hexColor(attr(child(rPr, 'color'), 'val'));
  if (color) out.color = color;
  const hl = attr(child(rPr, 'highlight'), 'val');
  if (hl && hl !== 'none') out.highlight = hl;
  const shd = attr(child(rPr, 'shd'), 'fill');
  const shdColor = hexColor(shd);
  if (shdColor) out.background = shdColor;
  const sz = attrNum(child(rPr, 'sz'), 'val');
  if (sz) out.fontSize = sz / 2;
  const fonts = child(rPr, 'rFonts');
  if (fonts) {
    const f = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi');
    const themeRef = attr(fonts, 'asciiTheme') ?? attr(fonts, 'hAnsiTheme');
    if (f) out.fontFamily = f;
    else if (themeRef) out.fontFamily = themeRef.startsWith('major') ? theme.major : theme.minor;
  }
  const va = attr(child(rPr, 'vertAlign'), 'val');
  if (va === 'superscript' || va === 'subscript') out.vertAlign = va;
  const caps = onOff(child(rPr, 'caps'));
  if (caps) out.caps = true;
  const vanish = onOff(child(rPr, 'vanish'));
  if (vanish) out.hidden = true;
  return out;
}

export function parseParaProps(pPr: Element | null): ParaProps {
  const out: ParaProps = {};
  if (!pPr) return out;
  const jc = attr(child(pPr, 'jc'), 'val');
  if (jc) {
    if (jc === 'center') out.align = 'center';
    else if (jc === 'right' || jc === 'end') out.align = 'right';
    else if (jc === 'both' || jc === 'distribute') out.align = 'justify';
    else out.align = 'left';
  }
  const ind = child(pPr, 'ind');
  if (ind) {
    const left = attrNum(ind, 'left') ?? attrNum(ind, 'start');
    if (left !== null) out.indentLeft = left;
    const first = attrNum(ind, 'firstLine');
    const hanging = attrNum(ind, 'hanging');
    if (first !== null) out.firstLine = first;
    else if (hanging !== null) out.firstLine = -hanging;
  }
  const sp = child(pPr, 'spacing');
  if (sp) {
    const before = attrNum(sp, 'before');
    const after = attrNum(sp, 'after');
    if (before !== null) out.spaceBefore = before;
    if (after !== null) out.spaceAfter = after;
    const line = attrNum(sp, 'line');
    const rule = attr(sp, 'lineRule') ?? 'auto';
    if (line && rule === 'auto') out.lineHeight = Math.round((line / 240) * 100) / 100;
  }
  const numPr = child(pPr, 'numPr');
  if (numPr) {
    const numId = attr(child(numPr, 'numId'), 'val');
    if (numId !== null) out.numId = numId;
    const ilvl = attrNum(child(numPr, 'ilvl'), 'val');
    if (ilvl !== null) out.ilvl = ilvl;
  }
  const ol = attrNum(child(pPr, 'outlineLvl'), 'val');
  if (ol !== null) out.outlineLvl = ol;
  if (onOff(child(pPr, 'pageBreakBefore'))) out.pageBreakBefore = true;
  return out;
}

export async function loadTheme(zip: JSZip, rels: DocxContext['rels']): Promise<DocxContext['theme']> {
  const rel = Array.from(rels.values()).find((r) => r.type === 'theme');
  const doc = rel ? await readXml(zip, rel.target) : null;
  if (!doc) return {};
  const major = descendants(doc, 'majorFont')[0];
  const minor = descendants(doc, 'minorFont')[0];
  return {
    major: attr(child(major, 'latin'), 'typeface') ?? undefined,
    minor: attr(child(minor, 'latin'), 'typeface') ?? undefined,
  };
}

export async function loadStyles(zip: JSZip, rels: DocxContext['rels'], theme: DocxContext['theme']) {
  const rel = Array.from(rels.values()).find((r) => r.type === 'styles');
  const doc = rel ? await readXml(zip, rel.target) : null;
  const styles = new Map<string, StyleDef>();
  let defaultRun: RunProps = {};
  let defaultPara: ParaProps = {};
  let defaultParaStyle: string | undefined;
  if (!doc) return { styles, defaultRun, defaultPara, defaultParaStyle };
  const defaults = child(doc.documentElement, 'docDefaults');
  defaultRun = parseRunProps(path(defaults, 'rPrDefault', 'rPr'), theme);
  defaultPara = parseParaProps(path(defaults, 'pPrDefault', 'pPr'));
  for (const s of children(doc.documentElement, 'style')) {
    const id = attr(s, 'styleId') ?? '';
    const def: StyleDef = {
      id,
      name: (attr(child(s, 'name'), 'val') ?? id).toLowerCase(),
      type: attr(s, 'type') ?? 'paragraph',
      basedOn: attr(child(s, 'basedOn'), 'val') ?? undefined,
      rPr: parseRunProps(child(s, 'rPr'), theme),
      pPr: parseParaProps(child(s, 'pPr')),
    };
    styles.set(id, def);
    if (def.type === 'paragraph' && (attr(s, 'default') === '1' || attr(s, 'default') === 'true')) defaultParaStyle = id;
  }
  return { styles, defaultRun, defaultPara, defaultParaStyle };
}

/** Propiedades efectivas de un estilo siguiendo la cadena basedOn (sin docDefaults). */
export function styleChain(ctx: Pick<DocxContext, 'styles'>, id: string | undefined): StyleDef[] {
  const chain: StyleDef[] = [];
  const seen = new Set<string>();
  let cur = id ? ctx.styles.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.basedOn ? ctx.styles.get(cur.basedOn) : undefined;
  }
  return chain;
}

export function effectiveRun(ctx: DocxContext, styleId: string | undefined): RunProps {
  return Object.assign({}, ...styleChain(ctx, styleId).map((s) => s.rPr));
}

export function effectivePara(ctx: DocxContext, styleId: string | undefined): ParaProps {
  return Object.assign({}, ...styleChain(ctx, styleId).map((s) => s.pPr));
}

/** Nivel de título (1–6) de un estilo de párrafo, o 0. */
export function headingLevel(ctx: DocxContext, styleId: string | undefined, direct: ParaProps): number {
  for (const s of styleChain(ctx, styleId).reverse()) {
    const m = /^(heading|título|titulo|überschrift|titre)\s*([1-9])$/.exec(s.name) ?? /^(heading|ttulo|titulo)([1-9])$/i.exec(s.id);
    if (m) return Math.min(6, Number(m[2]));
    if (s.name === 'title' || s.name === 'título' || s.id === 'Title' || s.id === 'Puesto') return 1;
  }
  const ol = direct.outlineLvl ?? effectivePara(ctx, styleId).outlineLvl;
  if (ol !== undefined && ol >= 0 && ol < 6) return ol + 1;
  return 0;
}

export function isStyleNamed(ctx: DocxContext, styleId: string | undefined, re: RegExp): boolean {
  return styleChain(ctx, styleId).some((s) => re.test(s.name) || re.test(s.id));
}

export async function loadNumbering(zip: JSZip, rels: DocxContext['rels']) {
  const rel = Array.from(rels.values()).find((r) => r.type === 'numbering');
  const doc = rel ? await readXml(zip, rel.target) : null;
  const result = new Map<string, Map<number, NumLevel>>();
  if (!doc) return result;
  const abstract = new Map<string, Map<number, NumLevel>>();
  for (const a of children(doc.documentElement, 'abstractNum')) {
    const levels = new Map<number, NumLevel>();
    for (const lvl of children(a, 'lvl')) {
      levels.set(attrNum(lvl, 'ilvl') ?? 0, {
        format: attr(child(lvl, 'numFmt'), 'val') ?? 'decimal',
        start: attrNum(child(lvl, 'start'), 'val') ?? 1,
        text: attr(child(lvl, 'lvlText'), 'val') ?? '',
      });
    }
    abstract.set(attr(a, 'abstractNumId') ?? '', levels);
  }
  for (const n of children(doc.documentElement, 'num')) {
    const base = abstract.get(attr(child(n, 'abstractNumId'), 'val') ?? '') ?? new Map();
    const levels = new Map(base);
    for (const ov of children(n, 'lvlOverride')) {
      const ilvl = attrNum(ov, 'ilvl') ?? 0;
      const startOv = attrNum(child(ov, 'startOverride'), 'val');
      const lvl = child(ov, 'lvl');
      const prev = levels.get(ilvl) ?? { format: 'decimal', start: 1, text: '' };
      levels.set(ilvl, {
        format: lvl ? attr(child(lvl, 'numFmt'), 'val') ?? prev.format : prev.format,
        start: startOv ?? (lvl ? attrNum(child(lvl, 'start'), 'val') ?? prev.start : prev.start),
        text: prev.text,
      });
    }
    result.set(attr(n, 'numId') ?? '', levels);
  }
  return result;
}

/** Texto plano de las notas (footnotes.xml / endnotes.xml), excluyendo separadores. */
export async function loadNotes(zip: JSZip, rels: DocxContext['rels'], type: 'footnotes' | 'endnotes') {
  const rel = Array.from(rels.values()).find((r) => r.type === type);
  const doc = rel ? await readXml(zip, rel.target) : null;
  const map = new Map<string, string>();
  if (!doc) return map;
  const tag = type === 'footnotes' ? 'footnote' : 'endnote';
  for (const fn of children(doc.documentElement, tag)) {
    const t = attr(fn, 'type');
    if (t === 'separator' || t === 'continuationSeparator' || t === 'continuationNotice') continue;
    const text = children(fn, 'p')
      .map((p) => descendants(p, 't').map((x) => x.textContent ?? '').join(''))
      .join(' ')
      .trim();
    map.set(attr(fn, 'id') ?? '', text);
  }
  return map;
}
