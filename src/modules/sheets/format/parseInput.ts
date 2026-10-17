import { dateToSerial } from '../engine/dates';
import { getLocale } from './locale';

export interface ParsedInput {
  value: number | string | boolean | null;
  /** Formato sugerido según lo escrito (porcentaje, moneda, fecha...). */
  format?: string;
}

/** Interpreta texto como fecha y/u hora. Devuelve el número de serie. */
export function parseDateTimeText(input: string): { serial: number; format: string } | null {
  const s = input.trim();
  const loc = getLocale();
  let m: RegExpExecArray | null;
  const time = (str: string | undefined) => {
    if (!str) return { t: 0, fmt: '' };
    const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.?\s?m\.?|p\.?\s?m\.?)?$/i.exec(str.trim());
    if (!tm) return null;
    let h = Number(tm[1]);
    const mi = Number(tm[2]);
    const sec = tm[3] ? Number(tm[3]) : 0;
    if (tm[4]) {
      const pm = /^p/i.test(tm[4]);
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
    }
    if (h > 23 || mi > 59 || sec > 59) return null;
    return { t: (h * 3600 + mi * 60 + sec) / 86400, fmt: tm[3] ? 'hh:mm:ss' : 'hh:mm' };
  };
  // Solo hora
  const onlyTime = time(s);
  if (onlyTime && /:/.test(s)) return { serial: onlyTime.t, format: onlyTime.fmt };
  // ISO yyyy-mm-dd [hh:mm[:ss]]
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.+))?$/.exec(s))) {
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = time(m[4]);
    if (!t || !validDate(y, mo, d)) return null;
    return { serial: dateToSerial(y, mo, d) + t.t, format: t.fmt ? `yyyy-mm-dd ${t.fmt}` : 'yyyy-mm-dd' };
  }
  // dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy [hora]
  if ((m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})(?:\s+(.+))?$/.exec(s))) {
    let a = +m[1], b = +m[3];
    let y = +m[4];
    if (m[4].length === 2) y += y < 30 ? 2000 : 1900;
    if (loc.dateOrder === 'mdy') [a, b] = [b, a];
    const d = a, mo = b;
    const t = time(m[5]);
    if (!t || !validDate(y, mo, d)) return null;
    const base = loc.dateOrder === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
    return { serial: dateToSerial(y, mo, d) + t.t, format: t.fmt ? `${base} ${t.fmt}` : base };
  }
  // dd/mm (año actual)
  if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s))) {
    let d = +m[1], mo = +m[2];
    if (loc.dateOrder === 'mdy') [d, mo] = [mo, d];
    const y = new Date().getFullYear();
    if (!validDate(y, mo, d)) return null;
    return { serial: dateToSerial(y, mo, d), format: loc.dateOrder === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy' };
  }
  // "5 de marzo de 2025", "5 marzo 2025"
  if ((m = /^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\.?\s+(?:de\s+)?(\d{4})$/i.exec(s))) {
    const name = m[2].toLowerCase();
    const idx = loc.months.findIndex((x) => x.toLowerCase().startsWith(name.slice(0, 3)));
    if (idx >= 0 && validDate(+m[3], idx + 1, +m[1])) return { serial: dateToSerial(+m[3], idx + 1, +m[1]), format: 'd "de" mmmm "de" yyyy' };
  }
  return null;
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 9999) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Convierte una cadena con separadores locales a número, o null. */
export function parseLocaleNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(/ /g, '');
  if (!t) return null;
  const loc = getLocale();
  if (/^[+-]?\d+$/.test(t)) return Number(t);
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) && (loc.decimal === '.' || /e/i.test(t) || !/^[+-]?\d{1,3}\.\d{3}$/.test(t))) {
    // "3.5" se acepta también con coma decimal en la interfaz; "1.500" se interpreta como miles en locales con coma decimal.
    return Number(t);
  }
  const g = loc.group === '.' ? '\\.' : ',';
  const d = loc.decimal === ',' ? ',' : '\\.';
  const re = new RegExp(`^[+-]?(\\d{1,3}(${g}\\d{3})+|\\d+)(${d}\\d+)?$`);
  if (re.test(t)) {
    const n = Number(t.split(loc.group).join('').replace(loc.decimal, '.'));
    return Number.isFinite(n) ? n : null;
  }
  // Alternativa: el otro separador decimal ("3,5" con locale inglés)
  if (/^[+-]?\d+,\d+$/.test(t) && loc.decimal === ',') return Number(t.replace(',', '.'));
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  return null;
}

function decimalsOf(s: string): number {
  const m = /[.,](\d+)\s*$/.exec(s.replace(/[%€$£\s]/g, ''));
  return m ? m[1].length : 0;
}

/** Interpreta lo que escribe el usuario en una celda (no fórmulas). */
export function parseInput(raw: string): ParsedInput {
  if (raw === '') return { value: null };
  if (raw.startsWith("'")) return { value: raw.slice(1) };
  const s = raw.trim();
  const up = s.toUpperCase();
  if (up === 'TRUE' || up === 'VERDADERO') return { value: true };
  if (up === 'FALSE' || up === 'FALSO') return { value: false };
  // Porcentaje
  let m = /^([+-]?[\d.,]+)\s*%$/.exec(s);
  if (m) {
    const n = parseLocaleNumber(m[1]);
    if (n !== null) {
      const dec = decimalsOf(m[1]);
      return { value: n / 100, format: dec ? `0.${'0'.repeat(dec)}%` : '0%' };
    }
  }
  // Moneda
  m = /^([+-]?)\s*([€$£])\s*([\d.,]+)$/.exec(s) ?? /^([+-]?)([\d.,]+)\s*([€$£])$/.exec(s);
  if (m) {
    const symbol = /[€$£]/.exec(s)![0];
    const numText = m[3] && /[\d]/.test(m[3]) ? m[3] : m[2];
    const n = parseLocaleNumber(numText);
    if (n !== null) {
      const value = m[1] === '-' ? -n : n;
      const dec = decimalsOf(numText) ? '.00' : '.00';
      return { value, format: symbol === '€' ? `#,##0${dec} "€"` : `"${symbol}"#,##0${dec}` };
    }
  }
  const n = parseLocaleNumber(s);
  if (n !== null) {
    // Números con separador de miles escrito: conservar el formato
    const loc = getLocale();
    if (s.includes(loc.group) && new RegExp(`\\d\\${loc.group}\\d{3}`).test(s)) return { value: n, format: decimalsOf(s) ? '#,##0.00' : '#,##0' };
    return { value: n };
  }
  const dt = parseDateTimeText(s);
  if (dt) return { value: dt.serial, format: dt.format };
  return { value: raw };
}
