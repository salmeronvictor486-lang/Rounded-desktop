import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { Presentation, SlideElement } from '../model';
import { backgroundCss, elementBoxStyle, ElementContent, fontDefaultsCss } from '../SlideView';
import { slideTextExtensions } from '../textSchema';
import type { SlidesStore } from '../store';

interface Guide {
  axis: 'x' | 'y';
  pos: number;
}

interface Props {
  store: SlidesStore;
  version: number;
  zoom: number | 'fit';
  snapGrid: boolean;
  showGrid: boolean;
  onTextEditor: (e: Editor | null) => void;
  onContextMenu: (x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const SNAP = 6;
const GRID = 10;

function hasText(el: SlideElement) {
  return el.type === 'text' || el.type === 'shape';
}

/** Editor de texto en línea (TipTap) para cuadros de texto y formas. */
function InlineTextEditor({ store, el, pres, onEditor }: { store: SlidesStore; el: SlideElement; pres: Presentation; onEditor: (e: Editor | null) => void }) {
  const content = el.type === 'text' ? el.content : el.type === 'shape' ? el.content ?? { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center' } }] } : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const editor = useEditor({
    extensions: slideTextExtensions({ editor: true }),
    content,
    autofocus: 'end',
    editorProps: { attributes: { class: 'sl-rich sl-editing', 'aria-label': 'Texto de la diapositiva' } },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      store.updateElements([el.id], (e) => {
        if (e.type === 'text' || e.type === 'shape') e.content = json;
      }, { history: false });
      // Crecer el cuadro de texto si el contenido no cabe
      const box = ref.current;
      if (box && el.type === 'text') {
        const needed = box.scrollHeight;
        const current = store.slide.elements.find((x) => x.id === el.id);
        if (current && needed > current.h + 1) store.updateElements([el.id], { h: Math.ceil(needed) }, { history: false });
      }
    },
  });
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);
  const theme = pres.theme;
  const vAlign = el.type === 'text' ? el.style.vAlign ?? 'top' : el.type === 'shape' ? el.vAlign ?? 'middle' : 'top';
  return (
    <div
      ref={ref}
      className={`sl-text valign-${vAlign}`}
      style={{
        position: el.type === 'shape' ? 'absolute' : undefined,
        inset: el.type === 'shape' ? 0 : undefined,
        padding: el.type === 'text' ? el.style.padding ?? 8 : 10,
        background: el.type === 'text' ? el.style.fill ?? undefined : undefined,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
        cursor: 'text',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          store.editing = null;
          store.emit(false);
        }
        e.stopPropagation();
      }}
    >
      <div style={el.type === 'text' ? fontDefaultsCss(el.style.font) : undefined}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function SlideCanvas({ store, zoom, snapGrid, showGrid, onTextEditor, onContextMenu, canvasRef }: Props) {
  const pres = store.pres;
  const slide = store.slide;
  const { width: W, height: H } = pres.size;
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 900, h: 500 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = Math.max(0.1, Math.min((avail.w - 48) / W, (avail.h - 48) / H));
  const scale = zoom === 'fit' ? fit : zoom;

  const toSlide = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };

  const snapMove = (box: { x: number; y: number; w: number; h: number }, ignore: Set<string>) => {
    const out: Guide[] = [];
    let { x, y } = box;
    if (snapGrid) {
      x = Math.round(x / GRID) * GRID;
      y = Math.round(y / GRID) * GRID;
    }
    const targetsX = [0, W / 2, W];
    const targetsY = [0, H / 2, H];
    for (const e of slide.elements) {
      if (ignore.has(e.id)) continue;
      targetsX.push(e.x, e.x + e.w / 2, e.x + e.w);
      targetsY.push(e.y, e.y + e.h / 2, e.y + e.h);
    }
    const tol = SNAP / scale;
    const tryAxis = (pos: number, size: number, targets: number[], axis: 'x' | 'y'): number => {
      let best: { d: number; v: number; t: number } | null = null;
      for (const anchor of [0, size / 2, size]) {
        for (const t of targets) {
          const d = Math.abs(pos + anchor - t);
          if (d <= tol && (!best || d < best.d)) best = { d, v: t - anchor, t };
        }
      }
      if (best) {
        out.push({ axis, pos: best.t });
        return best.v;
      }
      return pos;
    };
    x = tryAxis(x, box.w, targetsX, 'x');
    y = tryAxis(y, box.h, targetsY, 'y');
    return { x, y, guides: out };
  };

  const startMove = (e: React.MouseEvent, el: SlideElement) => {
    e.preventDefault();
    e.stopPropagation();
    canvasRef.current?.focus({ preventScroll: true });
    if (store.editing && store.editing !== el.id) {
      store.editing = null;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      store.toggleSelect(el.id);
      return;
    }
    if (!store.selected.includes(el.id)) store.select([el.id]);
    const start = toSlide(e.clientX, e.clientY);
    const sel = store.selection.map((s) => ({ id: s.id, x: s.x, y: s.y }));
    const bounds = {
      x: Math.min(...store.selection.map((s) => s.x)),
      y: Math.min(...store.selection.map((s) => s.y)),
      w: Math.max(...store.selection.map((s) => s.x + s.w)) - Math.min(...store.selection.map((s) => s.x)),
      h: Math.max(...store.selection.map((s) => s.y + s.h)) - Math.min(...store.selection.map((s) => s.y)),
    };
    const ignore = new Set(sel.map((s) => s.id));
    let moved = false;
    store.beginGesture();
    const move = (ev: MouseEvent) => {
      const p = toSlide(ev.clientX, ev.clientY);
      let dx = p.x - start.x;
      let dy = p.y - start.y;
      if (!moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      moved = true;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const snapped = ev.altKey ? { x: bounds.x + dx, y: bounds.y + dy, guides: [] } : snapMove({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, ignore);
      dx = snapped.x - bounds.x;
      dy = snapped.y - bounds.y;
      setGuides(snapped.guides);
      store.updateElements(sel.map((s) => s.id), (el2) => {
        const o = sel.find((s) => s.id === el2.id)!;
        el2.x = Math.round(o.x + dx);
        el2.y = Math.round(o.y + dy);
      }, { history: false });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setGuides([]);
      store.endGesture();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const startResize = (e: React.MouseEvent, el: SlideElement, handle: (typeof HANDLES)[number]) => {
    e.preventDefault();
    e.stopPropagation();
    const start = toSlide(e.clientX, e.clientY);
    const o = { x: el.x, y: el.y, w: el.w, h: el.h };
    const rad = (el.rotation * Math.PI) / 180;
    const keepAspect = el.type === 'image';
    store.beginGesture();
    const move = (ev: MouseEvent) => {
      const p = toSlide(ev.clientX, ev.clientY);
      // Desplazamiento en el sistema local del elemento (tiene en cuenta la rotación)
      const gx = p.x - start.x;
      const gy = p.y - start.y;
      const dx = gx * Math.cos(-rad) - gy * Math.sin(-rad);
      const dy = gx * Math.sin(-rad) + gy * Math.cos(-rad);
      let { x, y, w, h } = o;
      if (handle.includes('e')) w = o.w + dx;
      if (handle.includes('s')) h = o.h + dy;
      if (handle.includes('w')) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (handle.includes('n')) {
        h = o.h - dy;
        y = o.y + dy;
      }
      const min = el.type === 'line' ? 0 : 12;
      if ((keepAspect !== ev.shiftKey) && handle.length === 2 && o.w > 0 && o.h > 0) {
        const ratio = o.w / o.h;
        if (Math.abs(w - o.w) > Math.abs(h - o.h) * ratio) {
          const nh = w / ratio;
          if (handle.includes('n')) y = o.y + (o.h - nh);
          h = nh;
        } else {
          const nw = h * ratio;
          if (handle.includes('w')) x = o.x + (o.w - nw);
          w = nw;
        }
      }
      if (snapGrid && !ev.altKey) {
        if (handle.includes('e')) w = Math.round((x + w) / GRID) * GRID - x;
        if (handle.includes('s')) h = Math.round((y + h) / GRID) * GRID - y;
      }
      if (w < min) {
        if (handle.includes('w')) x -= min - w;
        w = min;
      }
      if (h < min) {
        if (handle.includes('n')) y -= min - h;
        h = min;
      }
      store.updateElements([el.id], { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, { history: false });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      store.endGesture();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const startRotate = (e: React.MouseEvent, el: SlideElement) => {
    e.preventDefault();
    e.stopPropagation();
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    store.beginGesture();
    const move = (ev: MouseEvent) => {
      const p = toSlide(ev.clientX, ev.clientY);
      let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(((deg % 90) + 90) % 90) < 3 || Math.abs(((deg % 90) + 90) % 90) > 87) deg = Math.round(deg / 90) * 90;
      deg = ((Math.round(deg) % 360) + 360) % 360;
      store.updateElements([el.id], { rotation: deg }, { history: false });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      store.endGesture();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onStageMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    canvasRef.current?.focus({ preventScroll: true });
    if (store.editing) {
      store.editing = null;
    }
    const start = toSlide(e.clientX, e.clientY);
    if (!e.shiftKey) store.select([]);
    setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
    const move = (ev: MouseEvent) => {
      const p = toSlide(ev.clientX, ev.clientY);
      setMarquee({ x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const p = toSlide(ev.clientX, ev.clientY);
      const r = { x1: Math.min(start.x, p.x), y1: Math.min(start.y, p.y), x2: Math.max(start.x, p.x), y2: Math.max(start.y, p.y) };
      setMarquee(null);
      if (r.x2 - r.x1 < 3 && r.y2 - r.y1 < 3) {
        store.emit(false);
        return;
      }
      const hit = slide.elements.filter((el) => el.x < r.x2 && el.x + el.w > r.x1 && el.y < r.y2 && el.y + el.h > r.y1).map((el) => el.id);
      store.select(hit, ev.shiftKey);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const sel = store.selection;
  const single = sel.length === 1 ? sel[0] : null;
  const hs = 9 / scale;

  return (
    <div ref={wrapRef} className="stage-wrap" onMouseDown={(e) => e.target === wrapRef.current && onStageMouseDown(e)}>
      <div className="stage-scroll" style={{ width: W * scale, height: H * scale }}>
        <div
          ref={stageRef}
          className={`slide-surface stage ${showGrid ? 'show-grid' : ''}`}
          style={{ width: W, height: H, transform: `scale(${scale})`, ...backgroundCss(slide.background, pres.theme.background) }}
          onMouseDown={onStageMouseDown}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e.clientX, e.clientY);
          }}
        >
          {slide.elements.map((el) => {
            const isEditing = store.editing === el.id;
            return (
              <div
                key={el.id}
                className={`sl-el sl-${el.type} ed-el ${store.selected.includes(el.id) ? 'is-selected' : ''} ${isEditing ? 'is-editing' : ''}`}
                style={elementBoxStyle(el)}
                data-id={el.id}
                onMouseDown={(e) => {
                  if (isEditing) return;
                  if (e.button === 2) {
                    if (!store.selected.includes(el.id)) store.select([el.id]);
                    return;
                  }
                  startMove(e, el);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (hasText(el)) {
                    store.checkpoint();
                    store.editing = el.id;
                    store.selected = [el.id];
                    store.emit(false);
                  }
                }}
              >
                {isEditing ? (
                  <>
                    {el.type === 'shape' && <ElementContent el={el} pres={pres} hideText />}
                    <InlineTextEditor store={store} el={el} pres={pres} onEditor={onTextEditor} />
                  </>
                ) : (
                  <ElementContent el={el} pres={pres} />
                )}
              </div>
            );
          })}
          {/* Selección y tiradores */}
          {sel.map((el) => (
            <div key={`sel-${el.id}`} className="sel-box" style={{ ...elementBoxStyle(el), opacity: 1, borderWidth: 1.5 / scale }}>
              {single && single.id === el.id && store.editing !== el.id && (
                <>
                  {HANDLES.map((h) => (
                    <span
                      key={h}
                      className={`rz rz-${h}`}
                      style={{ width: hs, height: hs, borderWidth: 1.5 / scale, margin: -hs / 2 }}
                      onMouseDown={(e) => startResize(e, el, h)}
                    />
                  ))}
                  {el.type !== 'line' && (
                    <span className="rot" style={{ width: hs * 1.2, height: hs * 1.2, top: -28 / scale, marginLeft: (-hs * 1.2) / 2, borderWidth: 1.5 / scale }} onMouseDown={(e) => startRotate(e, el)} title="Girar (Mayús: pasos de 15°)" />
                  )}
                </>
              )}
            </div>
          ))}
          {guides.map((g, i) => (
            <div key={i} className={`snap-guide ${g.axis}`} style={g.axis === 'x' ? { left: g.pos, top: 0, height: H, width: 1 / scale } : { top: g.pos, left: 0, width: W, height: 1 / scale }} />
          ))}
          {marquee && (
            <div
              className="marquee"
              style={{ left: Math.min(marquee.x1, marquee.x2), top: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1), height: Math.abs(marquee.y2 - marquee.y1), borderWidth: 1 / scale }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
