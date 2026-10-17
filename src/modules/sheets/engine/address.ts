import type { RangeAddr } from '../model';

export function colToLetters(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function lettersToCol(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellName(r: number, c: number): string {
  return `${colToLetters(c)}${r + 1}`;
}

export function rangeName(r: RangeAddr): string {
  const a = cellName(r.r1, r.c1);
  return r.r1 === r.r2 && r.c1 === r.c2 ? a : `${a}:${cellName(r.r2, r.c2)}`;
}

/** Nombre de hoja con comillas si hace falta: 'Mi hoja'!A1 */
export function quoteSheet(name: string): string {
  return /^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** Analiza "A1", "$B$2", "A1:C3", "Hoja1!A1:B2", "'Mi hoja'!A:A". */
export function parseRangeRef(text: string): { sheet?: string; range: RangeAddr } | null {
  let s = text.trim();
  let sheet: string | undefined;
  const bang = s.lastIndexOf('!');
  if (bang > 0) {
    sheet = s.slice(0, bang);
    if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
    s = s.slice(bang + 1);
  }
  const parts = s.replace(/\$/g, '').toUpperCase().split(':');
  if (parts.length > 2) return null;
  const parseOne = (p: string) => {
    const m = /^([A-Z]{1,3})?(\d{1,7})?$/.exec(p);
    if (!m || (!m[1] && !m[2])) return null;
    return { c: m[1] ? lettersToCol(m[1]) : null, r: m[2] ? Number(m[2]) - 1 : null };
  };
  const a = parseOne(parts[0]);
  const b = parts[1] ? parseOne(parts[1]) : a;
  if (!a || !b) return null;
  const range: RangeAddr = {
    r1: a.r ?? 0,
    c1: a.c ?? 0,
    r2: b.r ?? (a.r === null ? 1_048_575 : a.r),
    c2: b.c ?? (a.c === null ? 16_383 : a.c),
  };
  if (a.r === null && b.r === null) {
    range.r1 = 0;
    range.r2 = 1_048_575;
  }
  if (a.c === null && b.c === null) {
    range.c1 = 0;
    range.c2 = 16_383;
  }
  if (range.r1 < 0 || range.c1 < 0) return null;
  return { sheet, range: { r1: Math.min(range.r1, range.r2), c1: Math.min(range.c1, range.c2), r2: Math.max(range.r1, range.r2), c2: Math.max(range.c1, range.c2) } };
}
