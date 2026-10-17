import { compareValues, type Value } from '../engine/values';
import { shiftFormula } from '../engine/parser';
import { formatValue } from '../format/numberFormat';
import { cellKey, type CellData, type RangeAddr, type Sheet } from '../model';
import type { SheetController } from '../controller';

/** Ordena las filas de un rango por una o varias columnas. */
export function sortRange(ctl: SheetController, range: RangeAddr, keys: { col: number; asc: boolean }[], hasHeader: boolean) {
  const start = range.r1 + (hasHeader ? 1 : 0);
  if (start >= range.r2) return;
  const sheet = ctl.sheet;
  const rows: { r: number; cells: (CellData | undefined)[]; vals: Value[] }[] = [];
  for (let r = start; r <= range.r2; r++) {
    const cells: (CellData | undefined)[] = [];
    for (let c = range.c1; c <= range.c2; c++) cells.push(sheet.cells[cellKey(r, c)]);
    rows.push({ r, cells, vals: keys.map((k) => ctl.value(r, k.col)) });
  }
  rows.sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const va = a.vals[i];
      const vb = b.vals[i];
      // Las celdas vacías siempre al final
      if ((va === null || va === '') && !(vb === null || vb === '')) return 1;
      if ((vb === null || vb === '') && !(va === null || va === '')) return -1;
      const cmp = compareValues(va, vb);
      if (cmp !== 0) return keys[i].asc ? cmp : -cmp;
    }
    return a.r - b.r;
  });
  const updates = new Map<string, CellData | undefined>();
  rows.forEach((row, i) => {
    const target = start + i;
    row.cells.forEach((cell, j) => {
      const c = range.c1 + j;
      const next = cell ? { ...cell } : undefined;
      if (next?.f !== undefined && target !== row.r) next.f = shiftFormula(next.f, target - row.r, 0);
      updates.set(cellKey(target, c), next);
    });
  });
  ctl.applyCells('Ordenar', updates);
}

/** Texto mostrado de una celda (para los filtros). */
export function displayText(ctl: SheetController, sheet: Sheet, r: number, c: number): string {
  const v = ctl.engine.getValue(sheet.id, r, c);
  const style = ctl.styleOf(sheet.cells[cellKey(r, c)]);
  return formatValue(v, style.numFmt).text;
}

/** Filas ocultas por el filtro activo. */
export function hiddenRows(ctl: SheetController, sheet: Sheet): Set<number> {
  const out = new Set<number>();
  const f = sheet.filter;
  if (!f) return out;
  const cols = Object.entries(f.hidden).filter(([, v]) => v.length);
  if (!cols.length) return out;
  const sets = cols.map(([c, v]) => [Number(c), new Set(v)] as const);
  for (let r = f.range.r1 + 1; r <= f.range.r2; r++) {
    for (const [c, set] of sets) {
      if (set.has(displayText(ctl, sheet, r, c))) {
        out.add(r);
        break;
      }
    }
  }
  return out;
}

/** Valores distintos de una columna dentro del filtro. */
export function columnValues(ctl: SheetController, sheet: Sheet, col: number): { value: string; count: number }[] {
  const f = sheet.filter;
  if (!f) return [];
  const counts = new Map<string, number>();
  for (let r = f.range.r1 + 1; r <= f.range.r2; r++) {
    const t = displayText(ctl, sheet, r, col);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) => compareValues(a.value, b.value));
}

export function setFilter(ctl: SheetController, range: RangeAddr | null) {
  ctl.sheetOp(range ? 'Crear filtro' : 'Quitar filtro', (sheet) => {
    sheet.filter = range ? { range, hidden: {} } : null;
  }, { rebuild: false });
}

export function setFilterHidden(ctl: SheetController, col: number, hidden: string[]) {
  ctl.sheetOp('Filtrar', (sheet) => {
    if (!sheet.filter) return;
    sheet.filter.hidden = { ...sheet.filter.hidden, [col]: hidden };
  }, { rebuild: false });
}
