import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorView } from './useEditorView';

export interface PageBreakMark {
  /** Posición vertical (px, relativa al contenido) donde empieza la página. */
  top: number;
  page: number;
  manual: boolean;
}

/**
 * Calcula saltos de página aproximados recorriendo los bloques de primer
 * nivel y acumulando su altura. Los bloques no se parten entre páginas en
 * pantalla; la paginación exacta la hace el motor de impresión.
 */
export function usePagination(editor: Editor | null, contentHeightPx: number, deps: unknown[] = []) {
  const [marks, setMarks] = useState<PageBreakMark[]>([]);
  const view = useEditorView(editor);
  useEffect(() => {
    if (!editor || !view || contentHeightPx <= 0) return;
    let raf = 0;
    const compute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const root = view.dom as HTMLElement;
        const out: PageBreakMark[] = [];
        let pageStart = 0;
        let page = 1;
        for (const el of Array.from(root.children) as HTMLElement[]) {
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (el.classList.contains('page-break')) {
            page++;
            pageStart = bottom;
            out.push({ top: bottom, page, manual: true });
            continue;
          }
          while (bottom - pageStart > contentHeightPx && top > pageStart) {
            page++;
            pageStart = Math.max(top, pageStart + contentHeightPx);
            out.push({ top: pageStart, page, manual: false });
            if (bottom - pageStart <= contentHeightPx) break;
          }
          // Bloques más altos que una página (imágenes, tablas largas)
          while (bottom - pageStart > contentHeightPx) {
            page++;
            pageStart += contentHeightPx;
            out.push({ top: pageStart, page, manual: false });
          }
        }
        setMarks((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
      });
    };
    compute();
    editor.on('update', compute);
    const ro = new ResizeObserver(compute);
    ro.observe(view.dom);
    return () => {
      cancelAnimationFrame(raf);
      editor.off('update', compute);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, view, contentHeightPx, ...deps]);
  return marks;
}
