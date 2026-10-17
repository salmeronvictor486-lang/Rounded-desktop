import { adjustFormulaForStructure, renameSheetInFormula, type StructuralChange } from '../engine/parser';
import { parseRangeRef, quoteSheet, rangeName } from '../engine/address';
import { cellKey, createSheet, parseKey, type CellData, type RangeAddr, type Sheet } from '../model';
import type { SheetController } from '../controller';

function shiftIndex(v: number, ch: { index: number; count: number }): number | null {
  if (ch.count > 0) return v >= ch.index ? v + ch.count : v;
  const end = ch.index - ch.count - 1;
  if (v < ch.index) return v;
  if (v > end) return v + ch.count;
  return null;
}

function shiftRange(r: RangeAddr, axis: 'row' | 'col', ch: { index: number; count: number }): RangeAddr | null {
  const [a, b] = axis === 'row' ? [r.r1, r.r2] : [r.c1, r.c2];
  let s: number;
  let e: number;
  if (ch.count > 0) {
    s = a >= ch.index ? a + ch.count : a;
    e = b >= ch.index ? b + ch.count : b;
  } else {
    const n = -ch.count;
    const delEnd = ch.index + n - 1;
    if (a >= ch.index && b <= delEnd) return null;
    s = a > delEnd ? a - n : a >= ch.index ? ch.index : a;
    e = b > delEnd ? b - n : b >= ch.index ? ch.index - 1 : b;
    if (e < s) return null;
  }
  return axis === 'row' ? { ...r, r1: s, r2: e } : { ...r, c1: s, c2: e };
}

function shiftRecord(rec: Record<number, number>, ch: { index: number; count: number }): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = shiftIndex(Number(k), ch);
    if (n !== null) out[n] = v;
  }
  return out;
}

/** Inserta (count > 0) o elimina (count < 0) filas o columnas y ajusta fórmulas, combinaciones, reglas y gráficos. */
export function changeStructure(ctl: SheetController, axis: 'row' | 'col', index: number, count: number) {
  const sheetName = ctl.sheet.name;
  const ch: StructuralChange = { sheetName, axis, index, count };
  ctl.workbookOp(count > 0 ? (axis === 'row' ? 'Insertar filas' : 'Insertar columnas') : axis === 'row' ? 'Eliminar filas' : 'Eliminar columnas', (wb) => {
    for (const sheet of wb.sheets) {
      const isTarget = sheet.name === sheetName;
      const nextCells: Record<string, CellData> = {};
      for (const [key, cell] of Object.entries(sheet.cells)) {
        let [r, c] = parseKey(key);
        if (isTarget) {
          const moved = shiftIndex(axis === 'row' ? r : c, { index, count });
          if (moved === null) continue;
          if (axis === 'row') r = moved;
          else c = moved;
        }
        const next = cell.f !== undefined ? { ...cell, f: adjustFormulaForStructure(cell.f, sheet.name, ch) } : cell;
        nextCells[cellKey(r, c)] = next;
      }
      sheet.cells = nextCells;
      // Gráficos de cualquier hoja que apunten a la hoja modificada
      for (const chart of sheet.charts) {
        const adjusted = adjustFormulaForStructure(chart.range.includes('!') ? chart.range : `${quoteSheet(sheet.name)}!${chart.range}`, sheet.name, ch);
        if (!adjusted.includes('#REF!')) chart.range = adjusted;
      }
      if (!isTarget) continue;
      if (axis === 'row') {
        sheet.rowHeights = shiftRecord(sheet.rowHeights, { index, count });
        sheet.rowCount = Math.max(1, sheet.rowCount + count);
        if (sheet.freeze.rows > index) sheet.freeze.rows = Math.max(index, sheet.freeze.rows + count);
      } else {
        sheet.colWidths = shiftRecord(sheet.colWidths, { index, count });
        sheet.colCount = Math.max(1, sheet.colCount + count);
        if (sheet.freeze.cols > index) sheet.freeze.cols = Math.max(index, sheet.freeze.cols + count);
      }
      sheet.merges = sheet.merges.map((m) => shiftRange(m, axis, { index, count })).filter((m): m is RangeAddr => !!m && (m.r1 !== m.r2 || m.c1 !== m.c2));
      sheet.conditional = sheet.conditional.flatMap((rule) => {
        const r = shiftRange(rule.range, axis, { index, count });
        return r ? [{ ...rule, range: r }] : [];
      });
      sheet.validations = sheet.validations.flatMap((rule) => {
        const r = shiftRange(rule.range, axis, { index, count });
        return r ? [{ ...rule, range: r }] : [];
      });
      if (sheet.filter) {
        const r = shiftRange(sheet.filter.range, axis, { index, count });
        sheet.filter = r ? { ...sheet.filter, range: r } : null;
      }
    }
  });
}

/** Renombra una hoja actualizando todas las fórmulas que la referencian. */
export function renameSheet(ctl: SheetController, index: number, newName: string): string | null {
  const name = newName.trim();
  if (!name) return 'El nombre no puede estar vacío.';
  if (/[\\/?*[\]:]/.test(name) || name.length > 31) return 'El nombre no puede tener más de 31 caracteres ni contener \\ / ? * [ ] :';
  if (ctl.wb.sheets.some((s, i) => i !== index && s.name.toLowerCase() === name.toLowerCase())) return 'Ya existe una hoja con ese nombre.';
  const old = ctl.wb.sheets[index].name;
  if (old === name) return null;
  ctl.workbookOp('Cambiar nombre de hoja', (wb) => {
    wb.sheets[index].name = name;
    for (const sheet of wb.sheets) {
      for (const cell of Object.values(sheet.cells)) if (cell.f !== undefined) cell.f = renameSheetInFormula(cell.f, old, name);
      for (const chart of sheet.charts) chart.range = renameSheetInFormula(chart.range, old, name);
      for (const v of sheet.validations) if (v.source) v.source = renameSheetInFormula(v.source, old, name);
    }
  });
  return null;
}

export function uniqueSheetName(sheets: Sheet[], base = 'Hoja'): string {
  let i = sheets.length + 1;
  const taken = new Set(sheets.map((s) => s.name.toLowerCase()));
  while (taken.has(`${base}${i}`.toLowerCase())) i++;
  return `${base}${i}`;
}

export function addSheet(ctl: SheetController) {
  ctl.workbookOp('Añadir hoja', (wb) => {
    wb.sheets.splice(wb.activeSheet + 1, 0, createSheet(uniqueSheetName(wb.sheets)));
    wb.activeSheet += 1;
  });
  ctl.sel = { r: 0, c: 0, range: { r1: 0, c1: 0, r2: 0, c2: 0 } };
}

export function duplicateSheet(ctl: SheetController, index: number) {
  ctl.workbookOp('Duplicar hoja', (wb) => {
    const src = wb.sheets[index];
    const copy: Sheet = { ...structuredClone(src), id: createSheet('x').id };
    let name = `${src.name} (2)`;
    let k = 2;
    while (wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) name = `${src.name} (${++k})`;
    copy.name = name;
    copy.charts = copy.charts.map((c) => ({ ...c, id: `${c.id}-${k}` }));
    wb.sheets.splice(index + 1, 0, copy);
    wb.activeSheet = index + 1;
  });
}

export function deleteSheet(ctl: SheetController, index: number) {
  if (ctl.wb.sheets.length <= 1) return;
  ctl.workbookOp('Eliminar hoja', (wb) => {
    wb.sheets.splice(index, 1);
    wb.activeSheet = Math.max(0, Math.min(wb.activeSheet >= index ? wb.activeSheet - 1 : wb.activeSheet, wb.sheets.length - 1));
  });
}

export function moveSheet(ctl: SheetController, from: number, to: number) {
  if (to < 0 || to >= ctl.wb.sheets.length || from === to) return;
  ctl.workbookOp('Mover hoja', (wb) => {
    const [s] = wb.sheets.splice(from, 1);
    wb.sheets.splice(to, 0, s);
    wb.activeSheet = to;
  });
}

export function mergeCells(ctl: SheetController, range: RangeAddr) {
  if (range.r1 === range.r2 && range.c1 === range.c2) return;
  ctl.sheetOp('Combinar celdas', (sheet) => {
    sheet.merges = sheet.merges.filter((m) => !(m.r1 <= range.r2 && range.r1 <= m.r2 && m.c1 <= range.c2 && range.c1 <= m.c2));
    sheet.merges.push({ ...range });
    // Solo se conserva el contenido de la celda superior izquierda (como en Excel)
    for (let r = range.r1; r <= range.r2; r++)
      for (let c = range.c1; c <= range.c2; c++) {
        if (r === range.r1 && c === range.c1) continue;
        const key = cellKey(r, c);
        const cell = sheet.cells[key];
        if (cell) {
          if (cell.s) sheet.cells[key] = { s: cell.s };
          else delete sheet.cells[key];
        }
      }
  });
}

export function unmergeCells(ctl: SheetController, range: RangeAddr) {
  ctl.sheetOp('Separar celdas', (sheet) => {
    sheet.merges = sheet.merges.filter((m) => !(m.r1 <= range.r2 && range.r1 <= m.r2 && m.c1 <= range.c2 && range.c1 <= m.c2));
  }, { rebuild: false });
}

export function rangeToText(sheetName: string | null, r: RangeAddr): string {
  return sheetName ? `${quoteSheet(sheetName)}!${rangeName(r)}` : rangeName(r);
}

export { parseRangeRef };
