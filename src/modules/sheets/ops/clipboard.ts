import Papa from 'papaparse';
import { shiftFormula } from '../engine/parser';
import { escapeHtml } from '@/core/util/escape';
import { formatValue } from '../format/numberFormat';
import { cellKey, internStyle, type CellData, type CellStyle, type RangeAddr } from '../model';
import type { SheetController } from '../controller';

export interface ClipboardPayload {
  /** Origen para desplazar las fórmulas relativas. */
  origin: { r: number; c: number };
  cells: ({ data: CellData; style: CellStyle } | null)[][];
  tsv: string;
  cut: boolean;
  sheetId: string;
  range: RangeAddr;
}

let internal: ClipboardPayload | null = null;

export function copyRange(ctl: SheetController, range: RangeAddr, cut = false): ClipboardPayload {
  const cells: ClipboardPayload['cells'] = [];
  const lines: string[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const row: ClipboardPayload['cells'][number] = [];
    const texts: string[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const cell = ctl.getCell(r, c);
      row.push(cell ? { data: structuredClone(cell), style: ctl.styleOf(cell) } : null);
      const v = ctl.value(r, c);
      const t = formatValue(v, ctl.styleOf(cell).numFmt).text;
      texts.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    }
    cells.push(row);
    lines.push(texts.join('\t'));
  }
  internal = { origin: { r: range.r1, c: range.c1 }, cells, tsv: lines.join('\n'), cut, sheetId: ctl.sheet.id, range };
  return internal;
}

export function toHtmlTable(ctl: SheetController, range: RangeAddr): string {
  let html = '<table>';
  for (let r = range.r1; r <= range.r2; r++) {
    html += '<tr>';
    for (let c = range.c1; c <= range.c2; c++) {
      const cell = ctl.getCell(r, c);
      const st = ctl.styleOf(cell);
      const css = [st.bold && 'font-weight:bold', st.italic && 'font-style:italic', st.color && `color:${st.color}`, st.bg && `background:${st.bg}`].filter(Boolean).join(';');
      html += `<td${css ? ` style="${css}"` : ''}>${escapeHtml(formatValue(ctl.value(r, c), st.numFmt).text)}</td>`;
    }
    html += '</tr>';
  }
  return html + '</table>';
}

/** Pega en la celda activa. Usa el portapapeles interno si coincide con el texto copiado (conserva fórmulas y formato). */
export function pasteAt(ctl: SheetController, at: { r: number; c: number }, text: string | null, html: string | null, opts: { valuesOnly?: boolean } = {}) {
  const updates = new Map<string, CellData | undefined>();
  const useInternal = internal && (text === null || normalizeNl(text) === normalizeNl(internal.tsv));
  // Pegar en un rango mayor que el copiado repite el contenido (como Excel)
  const sel = ctl.sel.range;
  if (useInternal && internal) {
    const src = internal;
    const h = src.cells.length;
    const w = src.cells[0]?.length ?? 0;
    const repR = sel.r2 - sel.r1 + 1 > h && (sel.r2 - sel.r1 + 1) % h === 0 ? (sel.r2 - sel.r1 + 1) / h : 1;
    const repC = sel.c2 - sel.c1 + 1 > w && (sel.c2 - sel.c1 + 1) % w === 0 ? (sel.c2 - sel.c1 + 1) / w : 1;
    for (let rr = 0; rr < repR; rr++)
      for (let cc = 0; cc < repC; cc++)
        src.cells.forEach((row, i) =>
          row.forEach((item, j) => {
            const r = at.r + rr * h + i;
            const c = at.c + cc * w + j;
            if (!item) {
              updates.set(cellKey(r, c), undefined);
              return;
            }
            const data: CellData = {};
            if (opts.valuesOnly) {
              const v = ctl.engine.getValue(src.sheetId, src.origin.r + i, src.origin.c + j);
              if (v !== null && typeof v !== 'object') data.v = v;
              const existing = ctl.getCell(r, c);
              if (existing?.s) data.s = existing.s;
            } else {
              if (item.data.f !== undefined) data.f = src.cut ? item.data.f : shiftFormula(item.data.f, r - (src.origin.r + i), c - (src.origin.c + j));
              else if (item.data.v !== undefined) data.v = item.data.v;
              const s = internStyle(ctl.wb, item.style);
              if (s) data.s = s;
            }
            updates.set(cellKey(r, c), data);
          }),
        );
    if (src.cut && src.sheetId === ctl.sheet.id) {
      for (let r = src.range.r1; r <= src.range.r2; r++)
        for (let c = src.range.c1; c <= src.range.c2; c++) {
          const key = cellKey(r, c);
          const inTarget = r >= at.r && r < at.r + h && c >= at.c && c < at.c + w;
          if (!inTarget) updates.set(key, undefined);
        }
      internal = null;
    }
    ctl.applyCells('Pegar', updates);
    ctl.selectRange({ r1: at.r, c1: at.c, r2: at.r + h * repR - 1, c2: at.c + w * repC - 1 }, at);
    return;
  }
  const rows = html ? parseHtmlTable(html) ?? parseTsv(text ?? '') : parseTsv(text ?? '');
  if (!rows.length) return;
  rows.forEach((row, i) =>
    row.forEach((t, j) => {
      const key = cellKey(at.r + i, at.c + j);
      updates.set(key, ctl.buildCell(t, ctl.sheet.cells[key]));
    }),
  );
  ctl.applyCells('Pegar', updates);
  const w = Math.max(...rows.map((r) => r.length));
  ctl.selectRange({ r1: at.r, c1: at.c, r2: at.r + rows.length - 1, c2: at.c + w - 1 }, at);
}

function normalizeNl(s: string) {
  return s.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

export function parseTsv(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!clean) return [];
  if (!clean.includes('\t') && !clean.includes('"')) return clean.split('\n').map((l) => [l]);
  const res = Papa.parse<string[]>(clean, { delimiter: '\t', skipEmptyLines: false });
  return res.data;
}

/** Tablas HTML copiadas desde otras aplicaciones (Excel, LibreOffice, Google Sheets, páginas web). */
export function parseHtmlTable(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const row: string[] = [];
    tr.querySelectorAll('td,th').forEach((td) => {
      row.push((td.textContent ?? '').replace(/ /g, ' ').trim());
      const span = Number(td.getAttribute('colspan') ?? 1);
      for (let i = 1; i < span; i++) row.push('');
    });
    rows.push(row);
  });
  return rows.length ? rows : null;
}

export function hasInternalClipboard() {
  return !!internal;
}
