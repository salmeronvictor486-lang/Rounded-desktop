import JSZip from 'jszip';
import { inspectZip } from '@/core/files/zipGuard';
import { FileFormatError } from '@/core/files/errors';
import { attr, child, children, descendants, parseXml } from '@/core/files/xml';
import { escapeXml } from '@/core/util/escape';
import { BRAND } from '@/config/brand';
import { Engine } from '../engine/engine';
import { colToLetters, quoteSheet } from '../engine/address';
import { rewriteFormula, tokenize } from '../engine/parser';
import { isError } from '../engine/values';
import { dateToSerial, serialToParts } from '../engine/dates';
import { isDateFormat } from '../format/numberFormat';
import { cellKey, createSheet, createWorkbook, DEFAULT_COLS, DEFAULT_ROWS, internStyle, type CellStyle, type Workbook } from '../model';

const MAX_REPEAT_ROWS = 10_000;
const MAX_REPEAT_COLS = 1_024;

/** OpenFormula (of:=SUM([.A1:.B2])) → sintaxis de Excel (SUM(A1:B2)). */
export function openFormulaToExcel(f: string): string {
  let s = f.replace(/^(of:|oooc:|msoxl:)?=?/, '');
  // Referencias entre corchetes
  s = s.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split(':').map((p) => {
      const m = /^\$?(?:'((?:[^']|'')+)'|([^.']*))?\.(\$?[A-Z]+\$?\d+|\$?[A-Z]+|\$?\d+)$/i.exec(p.trim());
      if (!m) return { sheet: undefined as string | undefined, ref: p };
      const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] || undefined;
      return { sheet, ref: m[3] };
    });
    const sheet = parts[0].sheet;
    const refs = parts.map((p) => p.ref).join(':');
    return sheet ? `${quoteSheet(sheet)}!${refs}` : refs;
  });
  // Separadores ; → , fuera de cadenas
  let out = '';
  let inStr = false;
  for (const ch of s) {
    if (ch === '"') inStr = !inStr;
    out += !inStr && ch === ';' ? ',' : ch;
  }
  return out;
}

/** Sintaxis de Excel → OpenFormula. */
export function excelToOpenFormula(f: string): string {
  const withRefs = rewriteFormula(f, (tok) => {
    const sheet = tok.sheet !== undefined ? `$'${tok.sheet.replace(/'/g, "''")}'` : '';
    const part = (p: { col: number | null; row: number | null; absCol: boolean; absRow: boolean }) =>
      `${p.col !== null ? `${p.absCol ? '$' : ''}${colToLetters(p.col)}` : ''}${p.row !== null ? `${p.absRow ? '$' : ''}${p.row + 1}` : ''}`;
    return `[${sheet}.${part(tok.a)}${tok.b ? `:${sheet ? sheet : ''}.${part(tok.b)}` : ''}]`;
  });
  let out = '';
  let inStr = false;
  let depth = 0;
  try {
    tokenize(f);
  } catch {
    return `of:=${withRefs}`;
  }
  for (const ch of withRefs) {
    if (ch === '"') inStr = !inStr;
    if (!inStr && ch === '{') depth++;
    if (!inStr && ch === '}') depth--;
    out += !inStr && depth === 0 && ch === ',' ? ';' : ch;
  }
  return `of:=${out}`;
}

function lengthToPx(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (v.endsWith('cm')) return (n / 2.54) * 96;
  if (v.endsWith('mm')) return (n / 25.4) * 96;
  if (v.endsWith('in')) return n * 96;
  if (v.endsWith('pt')) return (n * 96) / 72;
  return n;
}

function parseDuration(v: string): number | null {
  const m = /^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(v);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)) / 86400;
}

export async function importOds(bytes: Uint8Array): Promise<{ wb: Workbook; warnings: string[] }> {
  inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new FileFormatError('El archivo no es una hoja ODS válida (falta content.xml).');
  const doc = parseXml(await contentFile.async('string'), 'content.xml');
  const stylesFile = zip.file('styles.xml');
  const stylesDoc = stylesFile ? parseXml(await stylesFile.async('string'), 'styles.xml') : null;
  const warnings = new Set<string>();
  if (zip.file(/^Basic\//).length) warnings.add('El documento contiene macros: se han descartado y no se ejecutarán.');
  if (descendants(doc, 'object').length || zip.file(/^Object /).length) warnings.add('Los gráficos y objetos incrustados no se importan.');

  const wb = createWorkbook([]);
  wb.sheets = [];
  // Estilos de celda y de columna
  const cellStyles = new Map<string, CellStyle>();
  const colWidths = new Map<string, number>();
  const rowHeights = new Map<string, number>();
  for (const d of [stylesDoc, doc]) {
    if (!d) continue;
    for (const st of descendants(d, 'style')) {
      const name = attr(st, 'name');
      if (!name) continue;
      const family = attr(st, 'family');
      if (family === 'table-column') {
        const w = lengthToPx(attr(child(st, 'table-column-properties'), 'column-width'));
        if (w) colWidths.set(name, Math.round(w));
      } else if (family === 'table-row') {
        const h = lengthToPx(attr(child(st, 'table-row-properties'), 'row-height'));
        if (h) rowHeights.set(name, Math.round(h));
      } else if (family === 'table-cell') {
        const s: CellStyle = {};
        const tp = child(st, 'text-properties');
        if (attr(tp, 'font-weight') === 'bold') s.bold = true;
        if (attr(tp, 'font-style') === 'italic') s.italic = true;
        if ((attr(tp, 'text-underline-style') ?? 'none') !== 'none') s.underline = true;
        const color = attr(tp, 'color');
        if (color && color !== '#000000') s.color = color;
        const size = attr(tp, 'font-size');
        if (size?.endsWith('pt') && parseFloat(size) !== 10 && parseFloat(size) !== 11) s.fontSize = parseFloat(size);
        const bg = attr(child(st, 'table-cell-properties'), 'background-color');
        if (bg && bg !== 'transparent') s.bg = bg;
        const align = attr(child(st, 'paragraph-properties'), 'text-align');
        if (align === 'center') s.hAlign = 'center';
        else if (align === 'end' || align === 'right') s.hAlign = 'right';
        else if (align === 'start' || align === 'left') s.hAlign = 'left';
        if (attr(child(st, 'table-cell-properties'), 'wrap-option') === 'wrap') s.wrap = true;
        cellStyles.set(name, s);
      }
    }
  }

  const spreadsheet = descendants(doc, 'spreadsheet')[0];
  for (const table of children(spreadsheet, 'table')) {
    const sheet = createSheet(attr(table, 'name') ?? `Hoja${wb.sheets.length + 1}`);
    // Columnas
    let col = 0;
    for (const colEl of descendants(table, 'table-column')) {
      const rep = Math.min(Number(attr(colEl, 'number-columns-repeated') ?? 1), MAX_REPEAT_COLS);
      const w = colWidths.get(attr(colEl, 'style-name') ?? '');
      for (let i = 0; i < rep; i++) {
        if (w && Math.abs(w - 85) > 3 && col < 1024) sheet.colWidths[col] = w;
        col++;
      }
    }
    let r = 0;
    let maxR = 0;
    let maxC = 0;
    const rowsEls = descendants(table, 'table-row');
    for (const row of rowsEls) {
      const repRows = Number(attr(row, 'number-rows-repeated') ?? 1);
      const cellsInRow = children(row).filter((x) => x.localName === 'table-cell' || x.localName === 'covered-table-cell');
      const hasContent = cellsInRow.some((c) => c.localName === 'table-cell' && (attr(c, 'value-type') || attr(c, 'formula') || c.textContent));
      const h = rowHeights.get(attr(row, 'style-name') ?? '');
      const times = hasContent ? Math.min(repRows, MAX_REPEAT_ROWS) : 1;
      for (let t = 0; t < times; t++) {
        let c = 0;
        if (h && Math.abs(h - 17) > 3 && hasContent) sheet.rowHeights[r] = h;
        for (const cell of cellsInRow) {
          const repC = Math.min(Number(attr(cell, 'number-columns-repeated') ?? 1), MAX_REPEAT_COLS);
          if (cell.localName === 'covered-table-cell') {
            c += repC;
            continue;
          }
          const type = attr(cell, 'value-type');
          const formula = attr(cell, 'formula');
          const style = cellStyles.get(attr(cell, 'style-name') ?? '') ?? {};
          const text = children(cell, 'p').map((p) => p.textContent ?? '').join('\n');
          let v: number | string | boolean | undefined;
          const st: CellStyle = { ...style };
          switch (type) {
            case 'float':
              v = Number(attr(cell, 'value'));
              break;
            case 'percentage':
              v = Number(attr(cell, 'value'));
              st.numFmt = Number.isInteger(v * 100) ? '0%' : '0.00%';
              break;
            case 'currency': {
              v = Number(attr(cell, 'value'));
              const cur = attr(cell, 'currency');
              st.numFmt = cur === 'USD' ? '"$"#,##0.00' : '#,##0.00 "€"';
              break;
            }
            case 'date': {
              const dv = attr(cell, 'date-value') ?? '';
              const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(dv);
              if (m) {
                v = dateToSerial(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
                st.numFmt = m[4] ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
              }
              break;
            }
            case 'time': {
              const d = parseDuration(attr(cell, 'time-value') ?? '');
              if (d !== null) {
                v = d;
                st.numFmt = 'hh:mm:ss';
              }
              break;
            }
            case 'boolean':
              v = attr(cell, 'boolean-value') === 'true';
              break;
            case 'string':
              v = text;
              break;
            default:
              if (text) v = text;
          }
          const s = internStyle(wb, st);
          const cs = Number(attr(cell, 'number-columns-spanned') ?? 1);
          const rs = Number(attr(cell, 'number-rows-spanned') ?? 1);
          for (let k = 0; k < repC; k++) {
            const data: { v?: number | string | boolean; f?: string; s?: number } = {};
            if (formula) data.f = openFormulaToExcel(formula);
            else if (v !== undefined) data.v = v;
            if (s) data.s = s;
            if (data.f !== undefined || data.v !== undefined || data.s) {
              if (data.f !== undefined || data.v !== undefined || repC < 50) {
                sheet.cells[cellKey(r, c)] = data;
                maxR = Math.max(maxR, r + 1);
                maxC = Math.max(maxC, c + 1);
              }
            }
            if ((cs > 1 || rs > 1) && k === 0) sheet.merges.push({ r1: r, c1: c, r2: r + rs - 1, c2: c + cs - 1 });
            c++;
          }
        }
        r++;
      }
      if (!hasContent) r += repRows - 1;
    }
    sheet.rowCount = Math.max(DEFAULT_ROWS, maxR + 100);
    sheet.colCount = Math.max(DEFAULT_COLS, maxC + 5);
    wb.sheets.push(sheet);
  }
  if (!wb.sheets.length) wb.sheets.push(createSheet('Hoja1'));
  return { wb, warnings: Array.from(warnings) };
}

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"';

export async function exportOds(wb: Workbook): Promise<{ blob: Blob; warnings: string[] }> {
  const engine = new Engine(wb);
  const warnings = new Set<string>();
  const styleXml: string[] = [
    '<number:percentage-style style:name="NPct"><number:number number:decimal-places="2" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>',
    '<number:date-style style:name="NDate"><number:day number:style="long"/><number:text>/</number:text><number:month number:style="long"/><number:text>/</number:text><number:year number:style="long"/></number:date-style>',
    '<number:time-style style:name="NTime"><number:hours number:style="long"/><number:text>:</number:text><number:minutes number:style="long"/></number:time-style>',
  ];
  const cellStyleName = new Map<number, string>();
  const styleFor = (idx: number | undefined): string | null => {
    if (!idx) return null;
    const existing = cellStyleName.get(idx);
    if (existing) return existing;
    const st = wb.styles[idx] ?? {};
    const name = `ce${idx}`;
    const tp = [st.bold && 'fo:font-weight="bold"', st.italic && 'fo:font-style="italic"', st.underline && 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"', st.color && `fo:color="${st.color}"`, st.fontSize && `fo:font-size="${st.fontSize}pt"`, st.fontFamily && `fo:font-family="${escapeXml(st.fontFamily)}"`].filter(Boolean).join(' ');
    const cp = [st.bg && `fo:background-color="${st.bg}"`, st.wrap && 'fo:wrap-option="wrap"', st.vAlign && `style:vertical-align="${st.vAlign}"`, st.borders?.bottom && `fo:border-bottom="0.5pt solid ${st.borders.bottom.color}"`, st.borders?.top && `fo:border-top="0.5pt solid ${st.borders.top.color}"`, st.borders?.left && `fo:border-left="0.5pt solid ${st.borders.left.color}"`, st.borders?.right && `fo:border-right="0.5pt solid ${st.borders.right.color}"`].filter(Boolean).join(' ');
    const pp = st.hAlign ? `fo:text-align="${st.hAlign === 'left' ? 'start' : st.hAlign === 'right' ? 'end' : 'center'}"` : '';
    const dataStyle = st.numFmt && /%/.test(st.numFmt) ? ' style:data-style-name="NPct"' : isDateFormat(st.numFmt) ? (/[dy]/i.test(st.numFmt ?? '') ? ' style:data-style-name="NDate"' : ' style:data-style-name="NTime"') : '';
    styleXml.push(`<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${dataStyle}>${cp ? `<style:table-cell-properties ${cp}/>` : ''}${pp ? `<style:paragraph-properties ${pp}/>` : ''}${tp ? `<style:text-properties ${tp}/>` : ''}</style:style>`);
    cellStyleName.set(idx, name);
    return name;
  };
  let tables = '';
  for (const sheet of wb.sheets) {
    let maxR = -1;
    let maxC = -1;
    for (const k of Object.keys(sheet.cells)) {
      const i = k.indexOf(',');
      maxR = Math.max(maxR, Number(k.slice(0, i)));
      maxC = Math.max(maxC, Number(k.slice(i + 1)));
    }
    const covered = new Set<string>();
    const spans = new Map<string, [number, number]>();
    for (const m of sheet.merges) {
      spans.set(cellKey(m.r1, m.c1), [m.r2 - m.r1 + 1, m.c2 - m.c1 + 1]);
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(cellKey(r, c));
      maxR = Math.max(maxR, m.r2);
      maxC = Math.max(maxC, m.c2);
    }
    let cols = '';
    for (let c = 0; c <= Math.max(0, maxC); c++) {
      const w = sheet.colWidths[c];
      if (w) {
        styleXml.push(`<style:style style:name="co${sheet.id}_${c}" style:family="table-column"><style:table-column-properties style:column-width="${(w / 96 * 2.54).toFixed(3)}cm"/></style:style>`);
        cols += `<table:table-column table:style-name="co${sheet.id}_${c}" table:default-cell-style-name="Default"/>`;
      } else cols += '<table:table-column table:default-cell-style-name="Default"/>';
    }
    let rows = '';
    for (let r = 0; r <= maxR; r++) {
      let row = '';
      for (let c = 0; c <= maxC; c++) {
        const key = cellKey(r, c);
        if (covered.has(key)) {
          row += '<table:covered-table-cell/>';
          continue;
        }
        const cell = sheet.cells[key];
        const span = spans.get(key);
        const spanAttr = span ? ` table:number-rows-spanned="${span[0]}" table:number-columns-spanned="${span[1]}"` : '';
        if (!cell) {
          row += `<table:table-cell${spanAttr}/>`;
          continue;
        }
        const sname = styleFor(cell.s);
        const sAttr = sname ? ` table:style-name="${sname}"` : '';
        const fAttr = cell.f !== undefined ? ` table:formula="${escapeXml(excelToOpenFormula(cell.f))}"` : '';
        const v = cell.f !== undefined ? engine.getValue(sheet.id, r, c) : cell.v ?? null;
        const fmt = cell.s ? wb.styles[cell.s]?.numFmt : undefined;
        let valueAttr = '';
        let text = '';
        if (typeof v === 'number') {
          if (isDateFormat(fmt) && /[dy]/i.test(fmt ?? '')) {
            const p = serialToParts(v);
            const iso = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}T${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}:${String(p.s).padStart(2, '0')}`;
            valueAttr = ` office:value-type="date" office:date-value="${iso}"`;
          } else if (fmt && /%/.test(fmt)) valueAttr = ` office:value-type="percentage" office:value="${v}"`;
          else valueAttr = ` office:value-type="float" office:value="${v}"`;
          text = String(v);
        } else if (typeof v === 'boolean') {
          valueAttr = ` office:value-type="boolean" office:boolean-value="${v}"`;
          text = v ? 'VERDADERO' : 'FALSO';
        } else if (isError(v)) {
          text = v.code;
        } else if (v !== null) {
          valueAttr = ' office:value-type="string"';
          text = String(v);
        }
        row += `<table:table-cell${sAttr}${fAttr}${valueAttr}${spanAttr}>${text !== '' ? text.split('\n').map((l) => `<text:p>${escapeXml(l)}</text:p>`).join('') : ''}</table:table-cell>`;
      }
      const h = sheet.rowHeights[r];
      if (h) styleXml.push(`<style:style style:name="ro${sheet.id}_${r}" style:family="table-row"><style:table-row-properties style:row-height="${(h / 96 * 2.54).toFixed(3)}cm"/></style:style>`);
      rows += `<table:table-row${h ? ` table:style-name="ro${sheet.id}_${r}"` : ''}>${row || '<table:table-cell/>'}</table:table-row>`;
    }
    if (!rows) rows = '<table:table-row><table:table-cell/></table:table-row>';
    tables += `<table:table table:name="${escapeXml(sheet.name)}">${cols || '<table:table-column/>'}${rows}</table:table>`;
    if (sheet.charts.length) warnings.add('Los gráficos no se incluyen en el archivo ODS.');
    if (sheet.conditional.length || sheet.validations.length) warnings.add('El formato condicional y la validación de datos no se exportan a ODS todavía.');
  }
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}><office:automatic-styles>${styleXml.join('')}</office:automatic-styles><office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS}><office:styles><style:style style:name="Default" style:family="table-cell"><style:text-properties fo:font-size="10pt"/></style:style></office:styles></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS}><office:meta><meta:generator>${BRAND.apps.spreadsheet.name}</meta:generator></office:meta></office:document-meta>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
  zip.file('content.xml', content);
  zip.file('styles.xml', styles);
  zip.file('meta.xml', meta);
  zip.file('META-INF/manifest.xml', manifest);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', compression: 'DEFLATE' });
  return { blob, warnings: Array.from(warnings) };
}
