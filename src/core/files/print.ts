/**
 * Imprime HTML mediante un iframe aislado. El diálogo del sistema permite
 * «Guardar como PDF», que produce un PDF paginado con texto seleccionable.
 */
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
