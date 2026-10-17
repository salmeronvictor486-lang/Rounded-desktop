import Papa from 'papaparse';
import { decodeText } from '@/core/files/signature';
import { Engine } from '../engine/engine';
import { isError } from '../engine/values';
import { formatValue, isDateFormat } from '../format/numberFormat';
import { parseDateTimeText } from '../format/parseInput';
import { cellKey, createWorkbook, DEFAULT_COLS, DEFAULT_ROWS, internStyle, type Sheet, type Workbook } from '../model';

/** Convierte un campo CSV a valor, usando el separador decimal típico del separador de campos. */
function csvValue(raw: string, decimal: '.' | ','): { v?: number | string | boolean; fmt?: string } {
  const s = raw.trim();
  if (s === '') return {};
  const numRe = decimal === '.' ? /^[+-]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?([eE][+-]?\d+)?$/ : /^[+-]?(\d+|\d{1,3}(\.\d{3})+)(,\d+)?([eE][+-]?\d+)?$/;
  if (numRe.test(s)) {
    const n = decimal === '.' ? Number(s.replace(/,/g, '')) : Number(s.replace(/\./g, '').replace(',', '.'));
    // Conservar ceros a la izquierda como texto (códigos postales, identificadores)
    if (/^0\d/.test(s)) return { v: raw };
    return Number.isFinite(n) ? { v: n } : { v: raw };
  }
  const pct = new RegExp(`^([+-]?\\d+(\\${decimal}\\d+)?)\\s*%$`).exec(s);
  if (pct) return { v: Number(pct[1].replace(',', '.')) / 100, fmt: pct[2] ? '0.00%' : '0%' };
  const up = s.toUpperCase();
  if (up === 'TRUE' || up === 'VERDADERO') return { v: true };
  if (up === 'FALSE' || up === 'FALSO') return { v: false };
  const dt = parseDateTimeText(s);
  if (dt) return { v: dt.serial, fmt: dt.format };
  return { v: raw };
}

export interface CsvImportResult {
  wb: Workbook;
  delimiter: string;
  encoding: string;
  rows: number;
}

/** Importa CSV/TSV detectando codificación (BOM, UTF-8 o Windows-1252) y separador. */
export function importCsv(bytes: Uint8Array, name = 'Hoja1', forced?: { delimiter?: string }): CsvImportResult {
  const { text, encoding } = decodeText(bytes);
  const res = Papa.parse<string[]>(text, {
    delimiter: forced?.delimiter ?? '',
    delimitersToGuess: [',', ';', '\t', '|'],
    skipEmptyLines: 'greedy',
  });
  const delimiter = res.meta.delimiter || ',';
  const decimal: '.' | ',' = delimiter === ';' ? ',' : '.';
  const wb = createWorkbook([name.slice(0, 31) || 'Hoja1']);
  const sheet = wb.sheets[0];
  let maxC = 0;
  res.data.forEach((row, r) => {
    row.forEach((field, c) => {
      const { v, fmt } = csvValue(field, decimal);
      if (v === undefined) return;
      const s = fmt ? internStyle(wb, { numFmt: fmt }) : 0;
      sheet.cells[cellKey(r, c)] = { v, ...(s ? { s } : {}) };
      maxC = Math.max(maxC, c + 1);
    });
  });
  sheet.rowCount = Math.max(DEFAULT_ROWS, res.data.length + 100);
  sheet.colCount = Math.max(DEFAULT_COLS, maxC + 5);
  // Primera fila en negrita si parece un encabezado
  const first = res.data[0];
  const second = res.data[1];
  if (first && second && first.every((f) => f && Number.isNaN(Number(f))) && second.some((f) => f !== '' && !Number.isNaN(Number(f.replace(',', '.'))))) {
    const bold = internStyle(wb, { bold: true });
    first.forEach((_, c) => {
      const cell = sheet.cells[cellKey(0, c)];
      if (cell) cell.s = bold;
    });
    sheet.freeze = { rows: 1, cols: 0 };
  }
  return { wb, delimiter, encoding, rows: res.data.length };
}

/** Exporta una hoja como CSV. */
export function exportCsv(wb: Workbook, sheet: Sheet, opts: { delimiter: ',' | ';' | '\t'; bom: boolean }): Blob {
  const engine = new Engine(wb);
  let maxR = -1;
  let maxC = -1;
  for (const k of Object.keys(sheet.cells)) {
    const i = k.indexOf(',');
    maxR = Math.max(maxR, Number(k.slice(0, i)));
    maxC = Math.max(maxC, Number(k.slice(i + 1)));
  }
  const decimal = opts.delimiter === ';' ? ',' : '.';
  const rows: string[][] = [];
  for (let r = 0; r <= maxR; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxC; c++) {
      const cell = sheet.cells[cellKey(r, c)];
      const v = cell ? engine.getValue(sheet.id, r, c) : null;
      const fmt = cell?.s ? wb.styles[cell.s]?.numFmt : undefined;
      if (v === null) row.push('');
      else if (isError(v)) row.push(v.code);
      else if (typeof v === 'number' && !isDateFormat(fmt)) row.push(String(v).replace('.', decimal));
      else if (typeof v === 'boolean') row.push(v ? 'TRUE' : 'FALSE');
      else if (typeof v === 'number') row.push(formatValue(v, fmt).text);
      else row.push(v);
    }
    rows.push(row);
  }
  const csv = Papa.unparse(rows, { delimiter: opts.delimiter, newline: '\r\n' });
  return new Blob([opts.bom ? '﻿' : '', csv], { type: opts.delimiter === '\t' ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8' });
}
