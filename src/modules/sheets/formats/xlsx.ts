import ExcelJS from 'exceljs';
import { inspectZip } from '@/core/files/zipGuard';
import { BRAND } from '@/config/brand';
import { Engine } from '../engine/engine';
import { parseRangeRef, rangeName } from '../engine/address';
import { isError } from '../engine/values';
import {
  cellKey,
  createSheet,
  createWorkbook,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  internStyle,
  type BorderDef,
  type CellData,
  type CellStyle,
  type ConditionalRule,
  type RangeAddr,
  type ValidationRule,
  type Workbook,
} from '../model';

/** Paleta de tema de Office predeterminada (aproximación para colores de tema). */
const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

function applyTint(hex: string, tint: number): string {
  const v = parseInt(hex, 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => (tint < 0 ? c * (1 + tint) : c + (255 - c) * tint));
  return ch.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

function color(c: Partial<ExcelJS.Color> | undefined): string | undefined {
  if (!c) return undefined;
  if (c.argb && /^[0-9A-F]{8}$/i.test(c.argb)) return `#${c.argb.slice(2).toLowerCase()}`;
  const theme = (c as { theme?: number }).theme;
  if (theme !== undefined && THEME[theme]) {
    const tint = (c as { tint?: number }).tint ?? 0;
    return `#${applyTint(THEME[theme], tint).toLowerCase()}`;
  }
  return undefined;
}

function argb(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  return m ? `FF${m[1].toUpperCase()}` : undefined;
}

const EPOCH = Date.UTC(1899, 11, 30);
function dateToSerial(d: Date): number {
  const serial = (d.getTime() - EPOCH) / 86_400_000;
  return serial < 61 ? serial - 1 : serial;
}

function cleanFormula(f: string): string {
  return f.replace(/^=/, '').replace(/_xlfn\.|_xlws\.|_xludf\./g, '');
}

function styleFromExcel(s: Partial<ExcelJS.Style>): CellStyle {
  const st: CellStyle = {};
  const f = s.font;
  if (f) {
    if (f.bold) st.bold = true;
    if (f.italic) st.italic = true;
    if (f.underline && f.underline !== 'none') st.underline = true;
    if (f.strike) st.strike = true;
    if (f.size && f.size !== 11) st.fontSize = f.size;
    if (f.name && !/^(Calibri|Aptos Narrow|Aptos)$/i.test(f.name)) st.fontFamily = f.name;
    const c = color(f.color);
    if (c && c !== '#000000') st.color = c;
  }
  const fill = s.fill;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const c = color(fill.fgColor);
    if (c) st.bg = c;
  }
  const a = s.alignment;
  if (a) {
    if (a.horizontal === 'center' || a.horizontal === 'centerContinuous') st.hAlign = 'center';
    else if (a.horizontal === 'right') st.hAlign = 'right';
    else if (a.horizontal === 'left') st.hAlign = 'left';
    if (a.vertical === 'top') st.vAlign = 'top';
    else if (a.vertical === 'middle') st.vAlign = 'middle';
    if (a.wrapText) st.wrap = true;
  }
  if (s.numFmt && s.numFmt !== 'General') st.numFmt = s.numFmt;
  const b = s.border;
  if (b) {
    const conv = (x: Partial<ExcelJS.Border> | undefined): BorderDef | undefined => {
      if (!x?.style) return undefined;
      const map: Record<string, BorderDef['style']> = { thin: 'thin', hair: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', dotted: 'dotted', double: 'double', mediumDashed: 'dashed', dashDot: 'dashed' };
      return { style: map[x.style] ?? 'thin', color: color(x.color) ?? '#000000' };
    };
    const borders = { top: conv(b.top), right: conv(b.right), bottom: conv(b.bottom), left: conv(b.left) };
    for (const k of Object.keys(borders) as (keyof typeof borders)[]) if (!borders[k]) delete borders[k];
    if (Object.keys(borders).length) st.borders = borders;
  }
  return st;
}

function styleToExcel(st: CellStyle): Partial<ExcelJS.Style> {
  const out: Partial<ExcelJS.Style> = {};
  const font: Partial<ExcelJS.Font> = {};
  if (st.bold) font.bold = true;
  if (st.italic) font.italic = true;
  if (st.underline) font.underline = true;
  if (st.strike) font.strike = true;
  if (st.fontSize) font.size = st.fontSize;
  if (st.fontFamily) font.name = st.fontFamily;
  if (st.color) font.color = { argb: argb(st.color) };
  if (Object.keys(font).length) out.font = font;
  if (st.bg) out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.bg) } };
  if (st.hAlign || st.vAlign || st.wrap) {
    out.alignment = { horizontal: st.hAlign, vertical: st.vAlign === 'middle' ? 'middle' : st.vAlign, wrapText: st.wrap || undefined };
  }
  if (st.numFmt) out.numFmt = st.numFmt;
  if (st.borders) {
    const conv = (b?: BorderDef): Partial<ExcelJS.Border> | undefined => (b ? { style: b.style === 'double' ? 'double' : b.style, color: { argb: argb(b.color) } } : undefined);
    out.border = { top: conv(st.borders.top), right: conv(st.borders.right), bottom: conv(st.borders.bottom), left: conv(st.borders.left) };
  }
  return out;
}

function rangeFromRef(ref: string): RangeAddr | null {
  const p = parseRangeRef(ref.split(' ')[0]);
  return p ? p.range : null;
}

const CF_OPS: Record<string, ConditionalRule['type']> = {
  greaterThan: 'gt', greaterThanOrEqual: 'gte', lessThan: 'lt', lessThanOrEqual: 'lte', equal: 'eq', notEqual: 'neq', between: 'between',
};

/** Importa un libro XLSX (también .xlsm, sin ejecutar macros). */
export async function importXlsx(bytes: Uint8Array): Promise<{ wb: Workbook; warnings: string[] }> {
  const entries = inspectZip(bytes);
  const warnings = new Set<string>();
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name))) warnings.add('El libro contiene macros: se han descartado y no se ejecutarán.');
  if (entries.some((e) => e.name.startsWith('xl/charts/'))) warnings.add('Los gráficos de Excel no se pueden importar todavía; puedes recrearlos con Insertar → Gráfico.');
  if (entries.some((e) => e.name.startsWith('xl/pivotTables/'))) warnings.add('Las tablas dinámicas se han importado como valores estáticos.');
  if (entries.some((e) => e.name.startsWith('xl/media/'))) warnings.add('Las imágenes incrustadas en hojas no se importan.');
  if (entries.some((e) => e.name.startsWith('xl/comments') || e.name.includes('threadedComments'))) warnings.add('Los comentarios de celda no se importan.');

  const xl = new ExcelJS.Workbook();
  await xl.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const wb = createWorkbook([]);
  wb.sheets = [];
  const definedNames = (xl.definedNames as unknown as { model?: unknown[] })?.model;
  if (Array.isArray(definedNames) && definedNames.length) warnings.add('Los nombres definidos no se admiten todavía: las fórmulas que los usan mostrarán #NAME?.');

  for (const ws of xl.worksheets) {
    const sheet = createSheet(ws.name);
    if (ws.state && ws.state !== 'visible') warnings.add('Algunas hojas estaban ocultas y ahora se muestran.');
    let maxR = 0;
    let maxC = 0;
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (row.height && Math.abs(row.height - 15) > 0.5) sheet.rowHeights[rn - 1] = Math.round((row.height * 96) / 72);
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        if (cell.type === ExcelJS.ValueType.Merge) return;
        const data: CellData = {};
        const v = cell.value as unknown;
        switch (cell.type) {
          case ExcelJS.ValueType.Number:
            data.v = v as number;
            break;
          case ExcelJS.ValueType.String:
          case ExcelJS.ValueType.SharedString:
            data.v = String(v);
            break;
          case ExcelJS.ValueType.Boolean:
            data.v = v as boolean;
            break;
          case ExcelJS.ValueType.Date:
            data.v = dateToSerial(v as Date);
            break;
          case ExcelJS.ValueType.RichText:
            data.v = ((v as ExcelJS.CellRichTextValue).richText ?? []).map((t) => t.text).join('');
            break;
          case ExcelJS.ValueType.Hyperlink: {
            const h = v as ExcelJS.CellHyperlinkValue;
            data.v = typeof h.text === 'string' ? h.text : ((h.text as unknown as ExcelJS.CellRichTextValue)?.richText ?? []).map((t) => t.text).join('');
            warnings.add('Los hipervínculos de celda se han importado como texto.');
            break;
          }
          case ExcelJS.ValueType.Formula: {
            const f = cell.formula;
            if (f) data.f = cleanFormula(f);
            break;
          }
          case ExcelJS.ValueType.Error:
            data.v = (v as ExcelJS.CellErrorValue).error;
            break;
          default:
            break;
        }
        const st = styleFromExcel(cell.style ?? {});
        const s = internStyle(wb, st);
        if (s) data.s = s;
        if (data.v === undefined && data.f === undefined && !data.s) return;
        sheet.cells[cellKey(rn - 1, cn - 1)] = data;
        maxR = Math.max(maxR, rn);
        maxC = Math.max(maxC, cn);
      });
    });
    // Anchos de columna (unidades de carácter → píxeles)
    for (let c = 1; c <= Math.max(ws.columnCount, maxC); c++) {
      const col = ws.getColumn(c);
      if (col.width && Math.abs(col.width - 8.43) > 0.2) sheet.colWidths[c - 1] = Math.round(col.width * 7 + 5);
      if (col.hidden) sheet.colWidths[c - 1] = 2;
    }
    for (const ref of (ws.model as { merges?: string[] }).merges ?? []) {
      const r = rangeFromRef(ref);
      if (r) {
        sheet.merges.push(r);
        maxR = Math.max(maxR, r.r2 + 1);
        maxC = Math.max(maxC, r.c2 + 1);
      }
    }
    const view = ws.views?.[0] as (Partial<ExcelJS.WorksheetView> & { xSplit?: number; ySplit?: number; showGridLines?: boolean }) | undefined;
    if (view?.state === 'frozen') sheet.freeze = { rows: view.ySplit ?? 0, cols: view.xSplit ?? 0 };
    if (view?.showGridLines === false) sheet.gridlines = false;
    const tab = color((ws.properties as { tabColor?: ExcelJS.Color })?.tabColor);
    if (tab) sheet.tabColor = tab;

    // Validación de datos
    const dv = (ws as unknown as { dataValidations?: { model?: Record<string, ExcelJS.DataValidation> } }).dataValidations?.model ?? {};
    for (const [ref, rule] of Object.entries(dv)) {
      const r = rangeFromRef(ref);
      if (!r || !rule) continue;
      const base = { id: `dv${Object.keys(sheet.validations).length}-${ref}`, range: r, allowBlank: rule.allowBlank !== false, strict: rule.errorStyle !== 'warning' && rule.errorStyle !== 'information', message: rule.error || undefined };
      const f = (rule.formulae ?? []).map((x) => String(x));
      if (rule.type === 'list') {
        const first = f[0] ?? '';
        if (first.startsWith('"')) sheet.validations.push({ ...base, type: 'list', values: first.replace(/^"|"$/g, '').split(',').map((s) => s.trim()) });
        else sheet.validations.push({ ...base, type: 'list', values: [], source: first.replace(/\$/g, '') });
      } else if (rule.type === 'whole' || rule.type === 'decimal' || rule.type === 'date' || rule.type === 'textLength') {
        const type: ValidationRule['type'] = rule.type === 'whole' ? 'integer' : rule.type === 'decimal' ? 'number' : rule.type;
        const op = rule.operator ?? 'between';
        const values = op === 'between' ? [f[0] ?? '', f[1] ?? ''] : op.startsWith('greater') ? [f[0] ?? '', ''] : op.startsWith('less') ? ['', f[0] ?? ''] : [f[0] ?? '', f[0] ?? ''];
        sheet.validations.push({ ...base, type, values });
      } else warnings.add('Algunas reglas de validación (personalizadas) no se admiten.');
    }

    // Formato condicional
    const cfs = (ws as unknown as { conditionalFormattings?: { ref: string; rules: any[] }[] }).conditionalFormattings ?? [];
    for (const cf of cfs) {
      const r = rangeFromRef(cf.ref);
      if (!r) continue;
      for (const rule of cf.rules) {
        const style = { bg: color(rule.style?.fill?.bgColor ?? rule.style?.fill?.fgColor), color: color(rule.style?.font?.color), bold: rule.style?.font?.bold || undefined };
        const id = `cf${sheet.conditional.length}`;
        if (rule.type === 'cellIs' && CF_OPS[rule.operator]) {
          sheet.conditional.push({ id, range: r, type: CF_OPS[rule.operator], values: (rule.formulae ?? []).map((x: unknown) => String(x).replace(/^"|"$/g, '')), style });
        } else if (rule.type === 'containsText') {
          sheet.conditional.push({ id, range: r, type: rule.operator === 'notContains' ? 'notContains' : 'contains', values: [rule.text ?? ''], style });
        } else if (rule.type === 'duplicateValues') {
          sheet.conditional.push({ id, range: r, type: 'duplicate', values: [], style });
        } else if (rule.type === 'colorScale' && Array.isArray(rule.color) && rule.color.length >= 2) {
          sheet.conditional.push({ id, range: r, type: 'colorScale', values: [], style: {}, colors: [color(rule.color[0]) ?? '#f8696b', color(rule.color[rule.color.length - 1]) ?? '#63be7b'] });
        } else warnings.add(`Algunas reglas de formato condicional (${rule.type}) no se admiten todavía.`);
      }
    }
    const af = (ws as unknown as { autoFilter?: string | { from: string; to: string } }).autoFilter;
    if (af) {
      const ref = typeof af === 'string' ? af : `${af.from}:${af.to}`;
      const r = rangeFromRef(ref);
      if (r) sheet.filter = { range: r, hidden: {} };
    }
    sheet.rowCount = Math.max(DEFAULT_ROWS, maxR + 100);
    sheet.colCount = Math.max(DEFAULT_COLS, maxC + 5);
    wb.sheets.push(sheet);
  }
  if (!wb.sheets.length) wb.sheets.push(createSheet('Hoja1'));
  return { wb, warnings: Array.from(warnings) };
}

/** Exporta el libro a XLSX con valores, fórmulas (y su resultado), estilos, combinaciones, dimensiones, validaciones y formato condicional. */
export async function exportXlsx(wb: Workbook): Promise<{ blob: Blob; warnings: string[] }> {
  const warnings = new Set<string>();
  const engine = new Engine(wb);
  const xl = new ExcelJS.Workbook();
  xl.creator = BRAND.apps.spreadsheet.name;
  xl.created = new Date();
  for (const sheet of wb.sheets) {
    const ws = xl.addWorksheet(sheet.name, {
      properties: sheet.tabColor ? { tabColor: { argb: argb(sheet.tabColor) } } : {},
      views: [
        sheet.freeze.rows || sheet.freeze.cols
          ? { state: 'frozen', xSplit: sheet.freeze.cols, ySplit: sheet.freeze.rows, showGridLines: sheet.gridlines !== false }
          : { state: 'normal', showGridLines: sheet.gridlines !== false },
      ],
    });
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const i = key.indexOf(',');
      const r = Number(key.slice(0, i));
      const c = Number(key.slice(i + 1));
      const xc = ws.getCell(r + 1, c + 1);
      if (cell.f !== undefined) {
        const res = engine.getValue(sheet.id, r, c);
        let result: ExcelJS.CellFormulaValue['result'];
        if (isError(res)) result = { error: (res.code === '#CIRC!' || res.code === '#SPILL!' ? '#REF!' : res.code) as ExcelJS.CellErrorValue['error'] };
        else if (res !== null) result = res as number | string | boolean;
        xc.value = { formula: cell.f, result } as ExcelJS.CellFormulaValue;
      } else if (cell.v !== undefined) {
        xc.value = cell.v;
      }
      const st = cell.s ? wb.styles[cell.s] : undefined;
      if (st && Object.keys(st).length) xc.style = styleToExcel(st);
    }
    for (const m of sheet.merges) {
      try {
        ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
      } catch {
        warnings.add('Algunas celdas combinadas se solapaban y no se han exportado.');
      }
    }
    for (const [c, w] of Object.entries(sheet.colWidths)) ws.getColumn(Number(c) + 1).width = Math.max(1, Math.round(((w - 5) / 7) * 100) / 100);
    for (const [r, h] of Object.entries(sheet.rowHeights)) ws.getRow(Number(r) + 1).height = Math.round(((h * 72) / 96) * 100) / 100;
    for (const v of sheet.validations) {
      const ref = rangeName(v.range);
      const base = { allowBlank: v.allowBlank, showErrorMessage: true, errorStyle: v.strict ? 'stop' : 'warning', error: v.message } as const;
      if (v.type === 'list') {
        const formula = v.source ? v.source : `"${v.values.join(',').slice(0, 250)}"`;
        (ws as any).dataValidations.add(ref, { ...base, type: 'list', formulae: [formula] });
      } else {
        const type = v.type === 'integer' ? 'whole' : v.type === 'number' ? 'decimal' : v.type;
        const [min, max] = v.values;
        const operator = min && max ? 'between' : min ? 'greaterThanOrEqual' : 'lessThanOrEqual';
        (ws as any).dataValidations.add(ref, { ...base, type, operator, formulae: [min || max, ...(min && max ? [max] : [])] });
      }
    }
    for (const rule of sheet.conditional) {
      const style = { fill: rule.style.bg ? { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(rule.style.bg) } } : undefined, font: rule.style.color || rule.style.bold ? { color: rule.style.color ? { argb: argb(rule.style.color) } : undefined, bold: rule.style.bold } : undefined };
      const ref = rangeName(rule.range);
      const opMap: Record<string, string> = { gt: 'greaterThan', gte: 'greaterThanOrEqual', lt: 'lessThan', lte: 'lessThanOrEqual', eq: 'equal', neq: 'notEqual', between: 'between' };
      const q = (x: string) => (x !== '' && Number.isFinite(Number(x.replace(',', '.'))) ? x.replace(',', '.') : `"${x.replace(/"/g, '""')}"`);
      let xr: any = null;
      if (opMap[rule.type]) xr = { type: 'cellIs', operator: opMap[rule.type], formulae: rule.values.map(q), style };
      else if (rule.type === 'contains' || rule.type === 'notContains') xr = { type: 'containsText', operator: rule.type === 'contains' ? 'containsText' : 'notContains', text: rule.values[0] ?? '', style };
      else if (rule.type === 'colorScale') xr = { type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], color: (rule.colors ?? ['#f8696b', '#63be7b']).map((c) => ({ argb: argb(c) })) };
      else if (rule.type === 'duplicate') xr = { type: 'duplicateValues', style } as any;
      else if (rule.type === 'empty') xr = { type: 'expression', formulae: [`LEN(TRIM(${rangeName({ ...rule.range, r2: rule.range.r1, c2: rule.range.c1 })}))=0`], style };
      else if (rule.type === 'notEmpty') xr = { type: 'expression', formulae: [`LEN(TRIM(${rangeName({ ...rule.range, r2: rule.range.r1, c2: rule.range.c1 })}))>0`], style };
      if (xr) ws.addConditionalFormatting({ ref, rules: [{ priority: 1, ...xr }] });
    }
    if (sheet.filter) ws.autoFilter = rangeName(sheet.filter.range);
    if (sheet.charts.length) warnings.add('Los gráficos no se incluyen en el archivo XLSX (limitación conocida); sí se conservan en Rounded Grid y al imprimir.');
  }
  const buf = await xl.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), warnings: Array.from(warnings) };
}

