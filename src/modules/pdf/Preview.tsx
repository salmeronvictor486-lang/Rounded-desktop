import { useEffect, useRef } from 'react';
import { normalizeFolio, type FolioContent } from './model';
import { openPdf } from './pdfjs';

export default function PdfPreview({ content }: { content: FolioContent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = normalizeFolio(content);
    if (!c.bytes.length) return;
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null;
    void openPdf(c.bytes).then(async (d) => {
      doc = d;
      const page = await d.getPage(1);
      const v = page.getViewport({ scale: 200 / page.getViewport({ scale: 1 }).width });
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = v.width;
      canvas.height = v.height;
      await page.render({ canvas, viewport: v }).promise;
    }).catch(() => undefined);
    return () => void doc?.loadingTask.destroy();
  }, [content]);
  return <canvas ref={ref} style={{ maxWidth: '100%', maxHeight: '100%', background: '#fff' }} aria-hidden="true" />;
}
