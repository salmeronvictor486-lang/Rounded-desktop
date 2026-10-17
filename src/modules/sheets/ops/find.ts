import { formatValue } from '../format/numberFormat';
import { parseKey, type CellData } from '../model';
import type { SheetController } from '../controller';

export interface FindOptions {
  matchCase: boolean;
  wholeCell: boolean;
  inFormulas: boolean;
  allSheets: boolean;
}

export interface FindMatch {
  sheetIndex: number;
  r: number;
  c: number;
}

export function findAll(ctl: SheetController, query: string, opts: FindOptions): FindMatch[] {
  if (!query) return [];
  const q = opts.matchCase ? query : query.toLowerCase();
  const out: FindMatch[] = [];
  const sheets = opts.allSheets ? ctl.wb.sheets.map((s, i) => [s, i] as const) : [[ctl.sheet, ctl.wb.activeSheet] as const];
  for (const [sheet, si] of sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const [r, c] = parseKey(key);
      let text: string;
      if (opts.inFormulas && cell.f !== undefined) text = `=${cell.f}`;
      else text = formatValue(ctl.engine.getValue(sheet.id, r, c), ctl.styleOf(cell).numFmt).text;
      if (!opts.matchCase) text = text.toLowerCase();
      if (opts.wholeCell ? text === q : text.includes(q)) out.push({ sheetIndex: si, r, c });
    }
  }
  return out.sort((a, b) => a.sheetIndex - b.sheetIndex || a.r - b.r || a.c - b.c);
}

/** Reemplaza en el contenido editable (literal o fórmula) de las celdas coincidentes. */
export function replaceIn(ctl: SheetController, matches: FindMatch[], query: string, replacement: string, opts: FindOptions): number {
  let count = 0;
  const flags = opts.matchCase ? 'g' : 'gi';
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  const bySheet = new Map<number, FindMatch[]>();
  for (const m of matches) bySheet.set(m.sheetIndex, [...(bySheet.get(m.sheetIndex) ?? []), m]);
  for (const [si, list] of bySheet) {
    const sheet = ctl.wb.sheets[si];
    const updates = new Map<string, CellData | undefined>();
    for (const m of list) {
      const raw = ctl.rawInput(m.r, m.c, sheet);
      const next = opts.wholeCell ? replacement : raw.replace(re, replacement);
      if (next === raw) continue;
      const key = `${m.r},${m.c}`;
      updates.set(key, ctl.buildCell(next, sheet.cells[key]));
      count++;
    }
    ctl.applyCells('Reemplazar', updates, sheet);
  }
  return count;
}
