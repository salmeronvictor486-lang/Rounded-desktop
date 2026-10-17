import { escapeHtml } from '@/core/util/escape';
import { DOCUMENT_CSS, docBodyHtml } from './formats/html';
import { normalizeWriterContent, pageDimensions, type HeaderFooter, type WriterContent } from './model';
import { documentStyleCss } from './styleCss';

function marginBoxContent(hf: HeaderFooter): string {
  // Construye el valor CSS `content` con contadores de página.
  const parts: string[] = [];
  const re = /\{(page|pages)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const lit = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  while ((m = re.exec(hf.text))) {
    if (m.index > last) parts.push(lit(hf.text.slice(last, m.index)));
    parts.push(m[1] === 'page' ? 'counter(page)' : 'counter(pages)');
    last = m.index + m[0].length;
  }
  if (last < hf.text.length) parts.push(lit(hf.text.slice(last)));
  return parts.join(' ') || '""';
}

/** HTML completo listo para imprimir o guardar como PDF con paginación real del navegador. */
export function buildPrintHtml(input: WriterContent, title: string): string {
  const c = normalizeWriterContent(input);
  const page = c.page;
  const dims = pageDimensions(page);
  const box = (where: 'top' | 'bottom', hf: HeaderFooter) => {
    if (!hf.text.trim()) return '';
    const pos = `${where}-${hf.align === 'left' ? 'left' : hf.align === 'right' ? 'right' : 'center'}`;
    return `@${pos} { content: ${marginBoxContent(hf)}; font: 9pt Calibri, Carlito, Arial, sans-serif; color: #666; }`;
  };
  const first = page.differentFirstPage ? `@page :first { @top-left { content: none } @top-center { content: none } @top-right { content: none } @bottom-left { content: none } @bottom-center { content: none } @bottom-right { content: none } }` : '';
  return `<!doctype html><html lang="${c.language ?? 'es'}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: ${dims.width}mm ${dims.height}mm; margin: ${page.margins.top}mm ${page.margins.right}mm ${page.margins.bottom}mm ${page.margins.left}mm; ${box('top', page.header)} ${box('bottom', page.footer)} }
${first}
html, body { margin: 0; padding: 0; background: #fff; }
${DOCUMENT_CSS}
${documentStyleCss(c.styles, 'body')}
.doc-body { ${page.columns > 1 ? `column-count: ${page.columns}; column-gap: ${page.columnGap}mm;` : ''} }
h1, h2, h3, h4 { break-after: avoid; }
table, img, tr { break-inside: avoid; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body><div class="doc-body">${docBodyHtml(c.doc)}</div></body></html>`;
}

/**
 * Imprime mediante un iframe aislado. El diálogo del sistema permite
 * "Guardar como PDF", que produce un PDF paginado con texto seleccionable.
 */
export function printDocument(content: WriterContent, title: string): Promise<void> {
  return printHtml(buildPrintHtml(content, title), title);
}

export function printHtml(html: string, title: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    iframe.srcdoc = html;
    iframe.onload = () => {
      const win = iframe.contentWindow!;
      const prevTitle = document.title;
      document.title = title;
      const done = () => {
        document.title = prevTitle;
        setTimeout(() => iframe.remove(), 500);
        resolve();
      };
      win.addEventListener('afterprint', done, { once: true });
      // Esperar a que carguen las imágenes
      const imgs = Array.from(win.document.images);
      Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => (im.onload = im.onerror = r))))).then(() => {
        win.focus();
        win.print();
        // Algunos navegadores no emiten afterprint
        setTimeout(done, 60_000);
      });
    };
    document.body.appendChild(iframe);
  });
}
