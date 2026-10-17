import { formatGeneralNumber, isError, type Value } from '../engine/values';
import { serialToParts } from '../engine/dates';
import { getLocale, type NumberLocale } from './locale';

export interface FormattedValue {
  text: string;
  color?: string;
}

interface Section {
  raw: string;
  color?: string;
  kind: 'number' | 'date' | 'text' | 'general';
  elapsed?: boolean;
}

const COLOR_NAMES: Record<string, string> = {
  red: '#dc2626', rojo: '#dc2626', blue: '#2563eb', azul: '#2563eb', green: '#16a34a', verde: '#16a34a',
  black: '#000000', negro: '#000000', magenta: '#c026d3', cyan: '#0891b2', yellow: '#ca8a04', white: '#ffffff',
};

function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === '"') inQ = !inQ;
    if (ch === '\\' && !inQ) {
      cur += ch + (fmt[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === ';' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Quita literales para detectar el tipo del formato. */
function stripLiterals(s: string): string {
  return s.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, (m) => (/^\[(h+|m+|s+)\]$/i.test(m) ? m : ''));
}

const cache = new Map<string, Section[]>();

function parseFormat(fmt: string): Section[] {
  let c = cache.get(fmt);
  if (c) return c;
  c = splitSections(fmt).map((raw) => {
    let color: string | undefined;
    raw = raw.replace(/\[(red|rojo|blue|azul|green|verde|black|negro|magenta|cyan|yellow|white)\]/gi, (_m, n) => {
      color = COLOR_NAMES[n.toLowerCase()];
      return '';
    });
    // [$€-C0A] → €
    raw = raw.replace(/\[\$([^\]-]*)(-[^\]]*)?\]/g, (_m, sym) => (sym ? `"${sym}"` : ''));
    const bare = stripLiterals(raw);
    let kind: Section['kind'] = 'number';
    if (/^\s*general\s*$/i.test(bare) || bare.trim() === '') kind = raw.trim() === '' ? 'general' : /general/i.test(bare) ? 'general' : 'number';
    if (bare.includes('@')) kind = 'text';
    else if (/[ymdhs]/i.test(bare.replace(/E[+-]/g, '')) && !/[0#?]/.test(bare.replace(/\.0+/g, ''))) kind = 'date';
    return { raw, color, kind, elapsed: /\[(h+|m+|s+)\]/i.test(raw) };
  });
  cache.set(fmt, c);
  return c;
}

function groupDigits(int: string, sep: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Formatea un número según una sección numérica ("#,##0.00", "0%", "0.00E+00", "€ #,##0"). */
function formatNumberSection(n: number, raw: string, loc: NumberLocale, signed: boolean): string {
  // Separar literales y máscara
  const tokens: { lit?: string; mask?: string }[] = [];
  let i = 0;
  let mask = '';
  const flush = () => {
    if (mask) tokens.push({ mask });
    mask = '';
  };
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      flush();
      const end = raw.indexOf('"', i + 1);
      tokens.push({ lit: raw.slice(i + 1, end < 0 ? raw.length : end) });
      i = end < 0 ? raw.length : end + 1;
    } else if (ch === '\\') {
      flush();
      tokens.push({ lit: raw[i + 1] ?? '' });
      i += 2;
    } else if (ch === '_') {
      flush();
      tokens.push({ lit: ' ' });
      i += 2;
    } else if (ch === '*') {
      i += 2;
    } else if ('0#?.,%Ee+-'.includes(ch) && (ch !== '-' && ch !== '+' ? true : /[Ee]$/.test(mask))) {
      mask += ch;
      i++;
    } else {
      flush();
      tokens.push({ lit: ch });
      i++;
    }
  }
  flush();
  const maskStr = tokens.filter((t) => t.mask).map((t) => t.mask).join('');
  const percent = (maskStr.match(/%/g) ?? []).length;
  let v = Math.abs(n) * Math.pow(100, percent);
  const sci = /E[+-]/i.exec(maskStr);
  const numMask = maskStr.replace(/%/g, '');
  let body: string;
  if (sci) {
    const [mant, expMask] = numMask.split(/E[+-]/i);
    const decs = (mant.split('.')[1] ?? '').replace(/[^0#?]/g, '').length;
    let exp = v === 0 ? 0 : Math.floor(Math.log10(v));
    let m = v / Math.pow(10, exp);
    if (Number(m.toFixed(decs)) >= 10) {
      m /= 10;
      exp++;
    }
    const expDigits = (expMask ?? '00').replace(/[^0]/g, '').length || 2;
    body = m.toFixed(decs).replace('.', loc.decimal) + 'E' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(expDigits, '0');
  } else {
    // Coma final: escala por miles
    let m = numMask;
    while (m.endsWith(',')) {
      v /= 1000;
      m = m.slice(0, -1);
    }
    const [intMask, decMask = ''] = m.split('.');
    const minDec = (decMask.match(/0/g) ?? []).length;
    const maxDec = (decMask.match(/[0#?]/g) ?? []).length;
    const grouping = intMask.includes(',');
    const minInt = (intMask.match(/0/g) ?? []).length;
    let fixed = v.toFixed(maxDec);
    let [ip, dp = ''] = fixed.split('.');
    while (dp.length > minDec && dp.endsWith('0')) dp = dp.slice(0, -1);
    if (ip === '0' && minInt === 0) ip = '';
    ip = ip.padStart(minInt, '0');
    if (grouping) ip = groupDigits(ip, loc.group);
    fixed = dp ? `${ip}${loc.decimal}${dp}` : m.includes('.') && maxDec === 0 ? ip : ip;
    body = fixed || (minInt ? '0' : '');
    if (!body && maxDec === 0) body = '0';
  }
  // Recomponer con literales en su sitio
  let out = '';
  let placed = false;
  for (const t of tokens) {
    if (t.lit !== undefined) out += t.lit;
    else if (!placed) {
      out += body + '%'.repeat(percent);
      placed = true;
    }
  }
  if (!placed) out += body;
  return (signed && n < 0 ? '-' : '') + out;
}

function formatDateSection(serial: number, raw: string, loc: NumberLocale, elapsed: boolean): string {
  const p = serialToParts(serial);
  const ampm = /AM\/PM|A\/P/i.test(raw);
  let out = '';
  let i = 0;
  const lower = raw;
  let lastWasHour = false;
  // ¿"m" significa minutos? (tras h o antes de s)
  const isMinute = (pos: number) => {
    const before = lower.slice(0, pos).replace(/"[^"]*"/g, '').replace(/[^hmsdy]/gi, '');
    const after = lower.slice(pos).replace(/"[^"]*"/g, '').replace(/^m+/i, '').replace(/[^hmsdy]/gi, '');
    return /h$/i.test(before) || /^s/i.test(after) || lastWasHour;
  };
  while (i < raw.length) {
    const ch = raw[i];
    const rest = raw.slice(i);
    let m: RegExpExecArray | null;
    if (ch === '"') {
      const end = raw.indexOf('"', i + 1);
      out += raw.slice(i + 1, end < 0 ? raw.length : end);
      i = end < 0 ? raw.length : end + 1;
      continue;
    }
    if (ch === '\\') {
      out += raw[i + 1] ?? '';
      i += 2;
      continue;
    }
    if ((m = /^\[(h+|m+|s+)\]/i.exec(rest))) {
      const unit = m[1][0].toLowerCase();
      const total = serial * (unit === 'h' ? 24 : unit === 'm' ? 1440 : 86400);
      out += String(Math.floor(total + 1e-9)).padStart(m[1].length, '0');
      i += m[0].length;
      lastWasHour = unit === 'h';
      continue;
    }
    if ((m = /^(yyyy|yy|aaaa|aa)/i.exec(rest))) {
      out += m[1].length === 4 ? String(p.y) : String(p.y % 100).padStart(2, '0');
      i += m[0].length;
      continue;
    }
    if ((m = /^m+/i.exec(rest))) {
      const len = m[0].length;
      if (len <= 2 && isMinute(i)) out += len === 2 ? String(p.mi).padStart(2, '0') : String(p.mi);
      else if (len === 1) out += String(p.m);
      else if (len === 2) out += String(p.m).padStart(2, '0');
      else if (len === 3) out += loc.monthsShort[p.m - 1];
      else if (len === 5) out += loc.months[p.m - 1][0].toUpperCase();
      else out += loc.months[p.m - 1];
      i += len;
      lastWasHour = false;
      continue;
    }
    if ((m = /^d+/i.exec(rest))) {
      const len = m[0].length;
      if (len === 1) out += String(p.d);
      else if (len === 2) out += String(p.d).padStart(2, '0');
      else if (len === 3) out += loc.daysShort[p.dow];
      else out += loc.days[p.dow];
      i += len;
      continue;
    }
    if ((m = /^h+/i.exec(rest))) {
      let h = p.h;
      if (ampm) h = h % 12 || 12;
      out += m[0].length >= 2 ? String(h).padStart(2, '0') : String(h);
      i += m[0].length;
      lastWasHour = true;
      continue;
    }
    if ((m = /^s+(\.0+)?/i.exec(rest))) {
      const sLen = m[0].replace(/\..*/, '').length;
      out += sLen >= 2 ? String(p.s).padStart(2, '0') : String(p.s);
      if (m[1]) out += loc.decimal + String(Math.floor(p.ms / Math.pow(10, 3 - (m[1].length - 1)))).padStart(m[1].length - 1, '0');
      i += m[0].length;
      lastWasHour = false;
      continue;
    }
    if ((m = /^(AM\/PM|A\/P)/i.exec(rest))) {
      const pm = p.h >= 12;
      out += m[1].length === 5 ? (pm ? 'PM' : 'AM') : pm ? 'P' : 'A';
      i += m[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  void elapsed;
  return out;
}

/** Formatea un valor según un código de formato tipo Excel. */
export function formatValue(v: Value, fmt: string | undefined, loc: NumberLocale = getLocale()): FormattedValue {
  if (v === null) return { text: '' };
  if (isError(v)) return { text: v.code };
  if (typeof v === 'boolean') return { text: v ? 'VERDADERO' : 'FALSO' };
  const sections = parseFormat(fmt && fmt.trim() ? fmt : 'General');
  if (typeof v === 'string') {
    const textSec = sections.find((s) => s.kind === 'text');
    if (!textSec) return { text: v };
    return { text: textSec.raw.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace('@', v), color: textSec.color };
  }
  if (!Number.isFinite(v)) return { text: '#NUM!' };
  let sec = sections[0];
  let signed = true;
  const numeric = sections.filter((s) => s.kind !== 'text');
  if (numeric.length >= 2 && v < 0) {
    sec = numeric[1];
    signed = false;
  } else if (numeric.length >= 3 && v === 0) sec = numeric[2];
  if (sec.kind === 'general' || /^\s*general\s*$/i.test(sec.raw)) {
    let t = formatGeneralNumber(v);
    if (loc.decimal !== '.') t = t.replace('.', loc.decimal);
    return { text: t, color: sec.color };
  }
  if (sec.kind === 'date') {
    if (v < 0 && !sec.elapsed) return { text: '#'.repeat(8) };
    return { text: formatDateSection(v, sec.raw, loc, !!sec.elapsed), color: sec.color };
  }
  if (sec.kind === 'text') return { text: String(v) };
  return { text: formatNumberSection(v, sec.raw, loc, signed), color: sec.color };
}

export function isDateFormat(fmt: string | undefined): boolean {
  if (!fmt) return false;
  return parseFormat(fmt).some((s) => s.kind === 'date');
}

/** Formatos predefinidos que ofrece la interfaz. */
export const NUMBER_FORMATS: { id: string; label: string; fmt: string }[] = [
  { id: 'general', label: 'General', fmt: 'General' },
  { id: 'number', label: 'Número (1.234,56)', fmt: '#,##0.00' },
  { id: 'integer', label: 'Número entero (1.234)', fmt: '#,##0' },
  { id: 'percent', label: 'Porcentaje (12,50 %)', fmt: '0.00%' },
  { id: 'eur', label: 'Moneda € (1.234,56 €)', fmt: '#,##0.00 "€"' },
  { id: 'usd', label: 'Moneda $ ($1,234.56)', fmt: '"$"#,##0.00' },
  { id: 'accounting', label: 'Contabilidad (negativos en rojo)', fmt: '#,##0.00 "€";[Red]-#,##0.00 "€"' },
  { id: 'scientific', label: 'Científico (1,23E+03)', fmt: '0.00E+00' },
  { id: 'date', label: 'Fecha (31/12/2025)', fmt: 'dd/mm/yyyy' },
  { id: 'dateLong', label: 'Fecha larga (31 de diciembre de 2025)', fmt: 'd "de" mmmm "de" yyyy' },
  { id: 'iso', label: 'Fecha ISO (2025-12-31)', fmt: 'yyyy-mm-dd' },
  { id: 'time', label: 'Hora (13:45)', fmt: 'hh:mm' },
  { id: 'datetime', label: 'Fecha y hora', fmt: 'dd/mm/yyyy hh:mm' },
  { id: 'duration', label: 'Duración ([h]:mm)', fmt: '[h]:mm' },
  { id: 'text', label: 'Texto sin formato', fmt: '@' },
];
