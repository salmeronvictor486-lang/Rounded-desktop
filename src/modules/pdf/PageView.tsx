import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { createId } from '@/core/util/id';
import { promptDialog } from '@/ui/dialogs';
import { pdfjs } from './pdfjs';
import type { Annotation, AnnotationType } from './model';

export type Tool = 'select' | AnnotationType;

interface Props {
  pdf: PDFDocumentProxy;
  index: number;
  pageId: string;
  scale: number;
  annotations: Annotation[];
  tool: Tool;
  color: string;
  query: string;
  selectedAnn: string | null;
  onSelectAnn: (id: string | null) => void;
  onAdd: (a: Annotation) => void;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  /** Tamaño estimado antes de renderizar (para reservar espacio). */
  estimate: { w: number; h: number };
  onSize?: (index: number, w: number, h: number) => void;
}

function normRect(r: number[]): { left: number; top: number; width: number; height: number } {
  const [x1, y1, x2, y2] = r;
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Una página del PDF: lienzo, capa de texto seleccionable y capa de anotaciones. Se renderiza al hacerse visible. */
export function PageView(props: Props) {
  const { pdf, index, scale, annotations, tool, color } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await pdf.getPage(index + 1).catch(() => null);
      if (cancelled || !page) return;
      const vp = page.getViewport({ scale });
      setViewport(vp);
      props.onSize?.(index, vp.width, vp.height);
      const canvas = canvasRef.current!;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(vp.width * ratio);
      canvas.height = Math.floor(vp.height * ratio);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      renderTask = page.render({ canvas, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      try {
        await renderTask.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      const lib = await pdfjs();
      const container = textRef.current!;
      container.replaceChildren();
      container.style.setProperty('--scale-factor', String(vp.scale));
      container.style.setProperty('--total-scale-factor', String(vp.scale));
      const tl = new lib.TextLayer({ textContentSource: page.streamTextContent(), container, viewport: vp });
      await tl.render().catch(() => undefined);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pdf, index, scale]);

  // Resaltar coincidencias de búsqueda en la capa de texto
  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    const q = props.query.trim().toLowerCase();
    container.querySelectorAll('span').forEach((s) => {
      s.classList.toggle('search-hit', !!q && (s.textContent ?? '').toLowerCase().includes(q));
    });
  });

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMouseDown = async (e: React.MouseEvent) => {
    if (tool === 'select' || !viewport || e.button !== 0) return;
    e.preventDefault();
    const start = toLocal(e);
    if (tool === 'note' || tool === 'text') {
      const text = await promptDialog({ title: tool === 'note' ? 'Nueva nota' : 'Nuevo texto', message: 'Texto', confirmLabel: 'Añadir' });
      if (!text) return;
      const w = tool === 'note' ? 180 : Math.max(60, Math.min(400, text.length * 7 + 16));
      const h = tool === 'note' ? 70 : 24;
      const [px1, py1] = viewport.convertToPdfPoint(start.x, start.y);
      const [px2, py2] = viewport.convertToPdfPoint(start.x + w, start.y + h);
      props.onAdd({ id: createId('a'), pageId: props.pageId, type: tool, rect: [px1, py1, px2, py2], color, text, fontSize: 11, createdAt: Date.now() });
      return;
    }
    setDraft({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
    const move = (ev: MouseEvent) => {
      const p = toLocal(ev);
      setDraft({ x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const p = toLocal(ev);
      setDraft(null);
      if (Math.abs(p.x - start.x) < 4 || Math.abs(p.y - start.y) < 3) return;
      const [px1, py1] = viewport.convertToPdfPoint(start.x, start.y);
      const [px2, py2] = viewport.convertToPdfPoint(p.x, p.y);
      props.onAdd({ id: createId('a'), pageId: props.pageId, type: tool, rect: [px1, py1, px2, py2], color, createdAt: Date.now() });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const w = viewport?.width ?? props.estimate.w;
  const h = viewport?.height ?? props.estimate.h;

  return (
    <div
      ref={wrapRef}
      className={`pdf-page tool-${tool}`}
      style={{ width: w, height: h }}
      data-page={index + 1}
      onMouseDown={onMouseDown}
      aria-label={`Página ${index + 1}`}
      role="region"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={textRef} className="textLayer" />
      {viewport && (
        <div className="ann-layer">
          {annotations.map((a) => {
            const [ax, ay] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
            const [bx, by] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
            const r = normRect([ax, ay, bx, by]);
            const sel = props.selectedAnn === a.id;
            return (
              <div
                key={a.id}
                className={`ann ann-${a.type} ${sel ? 'is-selected' : ''}`}
                style={{ ...r, ['--ann' as string]: a.color, fontSize: (a.fontSize ?? 11) * scale }}
                title={a.text}
                tabIndex={0}
                role="button"
                aria-label={`Anotación: ${a.type}${a.text ? `: ${a.text}` : ''}`}
                onMouseDown={(e) => {
                  if (tool !== 'select') return;
                  e.stopPropagation();
                  props.onSelectAnn(a.id);
                }}
                onDoubleClick={async () => {
                  if (a.type !== 'note' && a.type !== 'text') return;
                  const text = await promptDialog({ title: 'Editar texto', defaultValue: a.text ?? '' });
                  if (text !== null) props.onUpdate(a.id, { text });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') props.onSelectAnn(a.id);
                }}
              >
                {(a.type === 'note' || a.type === 'text') && <span>{a.text}</span>}
              </div>
            );
          })}
          {draft && <div className={`ann ann-${tool} is-draft`} style={{ ...normRect([draft.x1, draft.y1, draft.x2, draft.y2]), ['--ann' as string]: color }} />}
        </div>
      )}
    </div>
  );
}
