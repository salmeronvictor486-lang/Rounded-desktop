import { cellKey, createWorkbook, internStyle, type CellStyle, type ChartDef, type ConditionalRule, type ValidationRule, type Workbook } from '@/modules/sheets/model';
import { lettersToCol, parseRangeRef } from '@/modules/sheets/engine/address';

export type CellSpec = string | number | boolean | null | { v?: string | number | boolean; f?: string; s?: CellStyle };

interface SheetSpec {
  name: string;
  /** Filas a partir de A1. Las cadenas que empiezan por "=" son fórmulas. */
  rows: CellSpec[][];
  /** Estilos por rango A1. */
  styles?: [string, CellStyle][];
  widths?: Record<string, number>;
  freeze?: { rows: number; cols: number };
  merges?: string[];
  validations?: (Omit<ValidationRule, 'id' | 'range'> & { range: string })[];
  conditional?: (Omit<ConditionalRule, 'id' | 'range'> & { range: string })[];
  charts?: Omit<ChartDef, 'id'>[];
  filter?: string;
}

const range = (a1: string) => parseRangeRef(a1)!.range;

/** Construye un libro a partir de una especificación compacta (plantillas). */
export function buildWorkbook(sheets: SheetSpec[]): Workbook {
  const wb = createWorkbook(sheets.map((s) => s.name));
  sheets.forEach((spec, si) => {
    const sheet = wb.sheets[si];
    spec.rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell === null || cell === '') return;
        if (typeof cell === 'object') {
          const s = cell.s ? internStyle(wb, cell.s) : 0;
          sheet.cells[cellKey(r, c)] = { ...(cell.f ? { f: cell.f.replace(/^=/, '') } : { v: cell.v }), ...(s ? { s } : {}) };
        } else if (typeof cell === 'string' && cell.startsWith('=')) sheet.cells[cellKey(r, c)] = { f: cell.slice(1) };
        else sheet.cells[cellKey(r, c)] = { v: cell };
      }),
    );
    for (const [ref, style] of spec.styles ?? []) {
      const rg = range(ref);
      for (let r = rg.r1; r <= rg.r2; r++)
        for (let c = rg.c1; c <= rg.c2; c++) {
          const key = cellKey(r, c);
          const cell = sheet.cells[key] ?? {};
          const prev = cell.s ? wb.styles[cell.s] : {};
          const s = internStyle(wb, { ...prev, ...style });
          sheet.cells[key] = { ...cell, ...(s ? { s } : {}) };
        }
    }
    for (const [col, w] of Object.entries(spec.widths ?? {})) sheet.colWidths[lettersToCol(col)] = w;
    if (spec.freeze) sheet.freeze = spec.freeze;
    sheet.merges = (spec.merges ?? []).map(range);
    sheet.validations = (spec.validations ?? []).map((v, i) => ({ ...v, id: `tv${i}`, range: range(v.range) }));
    sheet.conditional = (spec.conditional ?? []).map((v, i) => ({ ...v, id: `tc${i}`, range: range(v.range) }));
    sheet.charts = (spec.charts ?? []).map((ch, i) => ({ ...ch, id: `tch${si}-${i}` }));
    if (spec.filter) sheet.filter = { range: range(spec.filter), hidden: {} };
  });
  return wb;
}

export const HEADER: CellStyle = { bold: true, bg: '#0f766e', color: '#ffffff', hAlign: 'center', vAlign: 'middle' };
export const TITLE: CellStyle = { bold: true, fontSize: 18, color: '#0f172a' };
export const EUR: CellStyle = { numFmt: '#,##0.00 "€"' };
export const PCT: CellStyle = { numFmt: '0%' };
export const DATE: CellStyle = { numFmt: 'dd/mm/yyyy' };
export const TOTAL: CellStyle = { bold: true, bg: '#f1f5f9', borders: { top: { style: 'medium', color: '#0f172a' } } };
