import { escapeHtml } from '@/core/util/escape';
import { DEFAULT_COL_WIDTH, cellKey, type Sheet } from './model';
import { cellDisplay } from './ops/display';
import { hiddenRows } from './ops/sortFilter';
import type { SheetController } from './controller';
import { ChartSvg, chartData } from './charts';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

/** Área usada de la hoja (celdas con contenido o formato, y gráficos). */
export function usedRange(sheet: Sheet): { r2: number; c2: number } {
  let r2 = -1;
  let c2 = -1;
  for (const k of Object.keys(sheet.cells)) {
    const i = k.indexOf(',');
    r2 = Math.max(r2, Number(k.slice(0, i)));
    c2 = Math.max(c2, Number(k.slice(i + 1)));
  }
  for (const m of sheet.merges) {
    r2 = Math.max(r2, m.r2);
    c2 = Math.max(c2, m.c2);
  }
  return { r2, c2 };
}

function borderCss(b?: { style: string; color: string }) {
  if (!b) return '';
  return `${b.style === 'medium' ? 2 : b.style === 'thick' ? 3 : 1}px ${b.style === 'dashed' || b.style === 'dotted' ? b.style : 'solid'} ${b.color}`;
}

/** HTML imprimible de una hoja (tabla con estilos, celdas combinadas y gráficos). */
export function buildSheetPrintHtml(ctl: SheetController, sheet: Sheet, title: string): string {
  const { r2, c2 } = usedRange(sheet);
  const hidden = hiddenRows(ctl, sheet);
  const covered = new Set<string>();
  const spans = new Map<string, { rs: number; cs: number }>();
  for (const m of sheet.merges) {
    spans.set(cellKey(m.r1, m.c1), { rs: m.r2 - m.r1 + 1, cs: m.c2 - m.c1 + 1 });
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(cellKey(r, c));
  }
  let html = '<table><colgroup>';
  for (let c = 0; c <= c2; c++) html += `<col style="width:${sheet.colWidths[c] ?? DEFAULT_COL_WIDTH}px">`;
  html += '</colgroup>';
  for (let r = 0; r <= r2; r++) {
    if (hidden.has(r)) continue;
    html += `<tr style="height:${sheet.rowHeights[r] ?? 24}px">`;
    for (let c = 0; c <= c2; c++) {
      const key = cellKey(r, c);
      if (covered.has(key)) continue;
      const d = cellDisplay(ctl, sheet, r, c);
      const st = d.style;
      const span = spans.get(key);
      const css = [
        `text-align:${d.align}`,
        st.bold && 'font-weight:bold',
        st.italic && 'font-style:italic',
        (st.underline || st.strike) && `text-decoration:${[st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ')}`,
        (d.color ?? st.color) && `color:${d.color ?? st.color}`,
        st.bg && `background:${st.bg}`,
        st.fontSize && `font-size:${st.fontSize}pt`,
        st.fontFamily && `font-family:${st.fontFamily}`,
        st.wrap ? 'white-space:pre-wrap' : 'white-space:pre',
        st.vAlign && `vertical-align:${st.vAlign}`,
        st.borders?.top && `border-top:${borderCss(st.borders.top)}`,
        st.borders?.bottom && `border-bottom:${borderCss(st.borders.bottom)}`,
        st.borders?.left && `border-left:${borderCss(st.borders.left)}`,
        st.borders?.right && `border-right:${borderCss(st.borders.right)}`,
      ].filter(Boolean).join(';');
      html += `<td${span ? ` rowspan="${span.rs}" colspan="${span.cs}"` : ''} style="${css}">${escapeHtml(d.text)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  const charts = sheet.charts
    .map((ch) => `<div class="chart">${renderToStaticMarkup(createElement(ChartSvg, { chart: ch, data: chartData(ctl, ch, sheet.id), width: ch.w, height: ch.h }))}</div>`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page { size: A4 landscape; margin: 12mm; @bottom-center { content: "${escapeHtml(sheet.name).replace(/"/g, '')} — " counter(page) " / " counter(pages); font: 8pt sans-serif; color: #777; } }
body { font: 10pt Calibri, Carlito, Arial, sans-serif; margin: 0; }
table { border-collapse: collapse; table-layout: fixed; }
td { border: 1px solid #d4d4d8; padding: 1px 4px; overflow: hidden; vertical-align: bottom; }
tr { break-inside: avoid; }
.chart { break-inside: avoid; margin-top: 12px; display: inline-block; margin-right: 12px; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${r2 < 0 ? '<p>(Hoja vacía)</p>' : html}${charts}</body></html>`;
}
