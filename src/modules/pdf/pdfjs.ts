import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let lib: typeof import('pdfjs-dist') | null = null;

/** Carga PDF.js bajo demanda con su worker servido desde el propio origen (sin CDN). */
export async function pdfjs() {
  if (!lib) {
    lib = await import('pdfjs-dist');
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return lib;
}

export async function openPdf(bytes: Uint8Array, askPassword?: (retry: boolean) => Promise<string | null>): Promise<PDFDocumentProxy> {
  const p = await pdfjs();
  // PDF.js transfiere el búfer al worker: se pasa una copia.
  const task = p.getDocument({ data: bytes.slice(), enableXfa: false, isEvalSupported: false } as Parameters<typeof p.getDocument>[0]);
  if (askPassword) {
    task.onPassword = async (update: (pw: string) => void, reason: number) => {
      const pw = await askPassword(reason === 2);
      if (pw === null) void task.destroy();
      else update(pw);
    };
  }
  return task.promise;
}
