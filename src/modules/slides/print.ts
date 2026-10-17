import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { escapeHtml } from '@/core/util/escape';
import type { Presentation } from './model';
import { SlideView } from './SlideView';
import { SLIDE_PRINT_CSS } from './slideCss';

/** HTML imprimible: una diapositiva por página (para «Guardar como PDF»). */
export function buildSlidesPrintHtml(pres: Presentation, title: string, opts: { notes?: boolean } = {}): string {
  const { width, height } = pres.size;
  const inW = width / 96;
  const inH = height / 96;
  const pages = pres.slides
    .filter((s) => !s.hidden)
    .map((s) => {
      const slide = renderToStaticMarkup(createElement(SlideView, { slide: s, pres, scale: opts.notes ? 0.62 : 1 }));
      return `<section class="page">${slide}${opts.notes ? `<div class="notes">${escapeHtml(s.notes || '')}</div>` : ''}</section>`;
    })
    .join('');
  const pageSize = opts.notes ? 'A4 portrait' : `${inW}in ${inH}in`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page { size: ${pageSize}; margin: ${opts.notes ? '12mm' : '0'}; }
html, body { margin: 0; padding: 0; }
.page { break-after: page; page-break-after: always; overflow: hidden; ${opts.notes ? '' : `width: ${width}px; height: ${height}px;`} }
.page:last-child { break-after: auto; }
.notes { margin-top: 12px; font: 11pt Calibri, Arial, sans-serif; white-space: pre-wrap; }
${SLIDE_PRINT_CSS}
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${pages}</body></html>`;
}
