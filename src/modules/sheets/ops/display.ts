import { compareValues, isError, type Value } from '../engine/values';
import { formatValue } from '../format/numberFormat';
import { parseInput } from '../format/parseInput';
import { cellKey, type CellStyle, type ConditionalRule, type Sheet } from '../model';
import type { SheetController } from '../controller';

export interface CellDisplay {
  text: string;
  value: Value;
  style: CellStyle;
  align: 'left' | 'center' | 'right';
  color?: string;
  error?: string;
}

const scaleCache = new WeakMap<ConditionalRule, { version: number; min: number; max: number; dupes?: Map<string, number> }>();

function ruleStats(ctl: SheetController, sheet: Sheet, rule: ConditionalRule) {
  const cached = scaleCache.get(rule);
  if (cached && cached.version === ctl.version) return cached;
  let min = Infinity;
  let max = -Infinity;
  const dupes = new Map<string, number>();
  const { r1, c1, r2, c2 } = rule.range;
  for (const [r, c] of ctl.cellsIn({ r1, c1, r2: Math.min(r2, r1 + 100000), c2 }, sheet)) {
    const v = ctl.engine.getValue(sheet.id, r, c);
    if (typeof v === 'number') {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (v !== null && v !== '') {
      const k = typeof v === 'string' ? v.toLowerCase() : String(v);
      dupes.set(k, (dupes.get(k) ?? 0) + 1);
    }
  }
  const s = { version: ctl.version, min, max, dupes };
  scaleCache.set(rule, s);
  return s;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

function operand(s: string | undefined): Value {
  if (s === undefined) return null;
  const p = parseInput(s);
  return p.value;
}

export function ruleMatches(ctl: SheetController, sheet: Sheet, rule: ConditionalRule, v: Value): boolean {
  const a = operand(rule.values[0]);
  const b = operand(rule.values[1]);
  const isEmpty = v === null || v === '';
  switch (rule.type) {
    case 'gt':
      return !isEmpty && compareValues(v, a) > 0;
    case 'gte':
      return !isEmpty && compareValues(v, a) >= 0;
    case 'lt':
      return !isEmpty && compareValues(v, a) < 0;
    case 'lte':
      return !isEmpty && compareValues(v, a) <= 0;
    case 'eq':
      return compareValues(v, a) === 0 && !isEmpty;
    case 'neq':
      return compareValues(v, a) !== 0;
    case 'between': {
      if (isEmpty) return false;
      const lo = compareValues(a, b) <= 0 ? a : b;
      const hi = lo === a ? b : a;
      return compareValues(v, lo) >= 0 && compareValues(v, hi) <= 0;
    }
    case 'contains':
      return typeof rule.values[0] === 'string' && String(v ?? '').toLowerCase().includes(rule.values[0].toLowerCase());
    case 'notContains':
      return !String(v ?? '').toLowerCase().includes((rule.values[0] ?? '').toLowerCase());
    case 'empty':
      return isEmpty;
    case 'notEmpty':
      return !isEmpty;
    case 'duplicate': {
      if (isEmpty) return false;
      const k = typeof v === 'string' ? v.toLowerCase() : String(v);
      return (ruleStats(ctl, sheet, rule).dupes?.get(k) ?? 0) > 1;
    }
    default:
      return false;
  }
}

/** Texto, alineación y estilo efectivo (incluido el formato condicional) de una celda. */
export function cellDisplay(ctl: SheetController, sheet: Sheet, r: number, c: number): CellDisplay {
  const cell = sheet.cells[cellKey(r, c)];
  const base = ctl.styleOf(cell);
  const value = cell ? ctl.engine.getValue(sheet.id, r, c) : null;
  let style = base;
  for (const rule of sheet.conditional) {
    const { r1, c1, r2, c2 } = rule.range;
    if (r < r1 || r > r2 || c < c1 || c > c2) continue;
    if (rule.type === 'colorScale') {
      if (typeof value !== 'number') continue;
      const st = ruleStats(ctl, sheet, rule);
      const t = st.max > st.min ? (value - st.min) / (st.max - st.min) : 0.5;
      const [from, to] = rule.colors ?? ['#f8696b', '#63be7b'];
      style = { ...style, bg: mix(from, to, Math.max(0, Math.min(1, t))) };
    } else if (ruleMatches(ctl, sheet, rule, value)) {
      style = { ...style, ...(rule.style.bg ? { bg: rule.style.bg } : {}), ...(rule.style.color ? { color: rule.style.color } : {}), ...(rule.style.bold ? { bold: true } : {}) };
    }
  }
  if (isError(value)) return { text: value.code, value, style, align: 'center', error: value.message ?? value.code, color: '#dc2626' };
  const f = formatValue(value, style.numFmt);
  const align = style.hAlign ?? (typeof value === 'number' ? 'right' : typeof value === 'boolean' ? 'center' : 'left');
  return { text: f.text, value, style, align, color: f.color };
}
