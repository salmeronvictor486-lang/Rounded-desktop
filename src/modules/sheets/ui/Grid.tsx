import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { colToLetters, rangeName } from '../engine/address';
import { cellKey, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, normalizeRange, type ChartDef, type RangeAddr } from '../model';
import { cellDisplay } from '../ops/display';
import { hiddenRows } from '../ops/sortFilter';
import type { SheetController } from '../controller';
import { Axis, HEADER_H, HEADER_W } from './geometry';
import { CellEditor, type EditState } from './CellEditor';
import { ChartLayer } from './ChartLayer';

export interface GridHandle {
  focus(): void;
  scrollToCell(r: number, c: number): void;
}

export type HeaderHit = { kind: 'col' | 'row'; index: number };

interface Props {
  ctl: SheetController;
  version: number;
  edit: EditState | null;
  setEdit: (e: EditState | null) => void;
  commitEdit: (move: { dr: number; dc: number } | null, opts?: { fillSelection?: boolean }) => void;
  onKey: (e: React.KeyboardEvent) => void;
  onCellContextMenu: (x: number, y: number) => void;
  onHeaderContextMenu: (hit: HeaderHit, x: number, y: number) => void;
  onFill: (source: RangeAddr, target: RangeAddr) => void;
  onFilterMenu: (col: number, anchor: HTMLElement) => void;
  onListMenu: (r: number, c: number, anchor: HTMLElement) => void;
  selectedChart: string | null;
  setSelectedChart: (id: string | null) => void;
  onEditChart: (chart: ChartDef) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  autoFit: (axis: 'col' | 'row', index: number) => void;
}

function measureFontCss(style: { bold?: boolean; italic?: boolean; fontSize?: number; fontFamily?: string }) {
  return `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : '400 '}${style.fontSize ?? 11}pt ${style.fontFamily ?? 'Calibri, Carlito, Arial, sans-serif'}`;
}

export function Grid(props: Props) {
  const { ctl, version, edit, setEdit, commitEdit, gridRef } = props;
  const sheet = ctl.sheet;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0, w: 800, h: 600 });
  const [fillPreview, setFillPreview] = useState<RangeAddr | null>(null);
  const [resizePreview, setResizePreview] = useState<{ axis: 'col' | 'row'; index: number; size: number } | null>(null);

  const hidden = useMemo(() => hiddenRows(ctl, sheet), [ctl, sheet, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => new Axis(sheet.rowCount, DEFAULT_ROW_HEIGHT, resizePreview?.axis === 'row' ? { ...sheet.rowHeights, [resizePreview.index]: resizePreview.size } : sheet.rowHeights, hidden), [sheet, sheet.rowCount, sheet.rowHeights, hidden, resizePreview, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = useMemo(() => new Axis(sheet.colCount, DEFAULT_COL_WIDTH, resizePreview?.axis === 'col' ? { ...sheet.colWidths, [resizePreview.index]: resizePreview.size } : sheet.colWidths), [sheet, sheet.colCount, sheet.colWidths, resizePreview, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const fr = Math.min(sheet.freeze.rows, sheet.rowCount);
  const fc = Math.min(sheet.freeze.cols, sheet.colCount);
  const frozenH = rows.offset(fr);
  const frozenW = cols.offset(fc);

  // Tamaño del área visible
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScroll((s) => ({ ...s, w: el.clientWidth, h: el.clientHeight }));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current!;
    setScroll({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth, h: el.clientHeight });
    // Crecer automáticamente al llegar al final
    if (el.scrollTop + el.clientHeight > rows.total - 300 && sheet.rowCount < 1_048_576) {
      sheet.rowCount = Math.min(1_048_576, sheet.rowCount + 500);
      ctl.emit(false);
    }
    if (el.scrollLeft + el.clientWidth > cols.total - 300 && sheet.colCount < 16_384) {
      sheet.colCount = Math.min(16_384, sheet.colCount + 10);
      ctl.emit(false);
    }
  }, [rows.total, cols.total, sheet, ctl]);

  // Coordenadas de pantalla (relativas al contenedor) de una celda
  const screenRect = useCallback(
    (r: number, c: number, r2 = r, c2 = c) => {
      const x = HEADER_W + cols.offset(c) - (c >= fc ? scroll.left : 0);
      const y = HEADER_H + rows.offset(r) - (r >= fr ? scroll.top : 0);
      return { left: x, top: y, width: cols.offset(c2 + 1) - cols.offset(c), height: rows.offset(r2 + 1) - rows.offset(r) };
    },
    [cols, rows, fc, fr, scroll.left, scroll.top],
  );

  /** Celda bajo el puntero. */
  const hitTest = useCallback(
    (clientX: number, clientY: number): { r: number; c: number; px: number; py: number } => {
      const rect = scrollRef.current!.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const x = px - HEADER_W < frozenW ? px - HEADER_W : px - HEADER_W + scroll.left;
      const y = py - HEADER_H < frozenH ? py - HEADER_H : py - HEADER_H + scroll.top;
      return { r: rows.indexAt(Math.max(0, y)), c: cols.indexAt(Math.max(0, x)), px, py };
    },
    [rows, cols, frozenW, frozenH, scroll.left, scroll.top],
  );

  // Desplazar para mostrar la celda activa
  const scrollToCell = useCallback(
    (r: number, c: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const viewW = el.clientWidth - HEADER_W;
      const viewH = el.clientHeight - HEADER_H;
      if (c >= fc) {
        const x0 = cols.offset(c);
        const x1 = x0 + cols.size(c);
        if (x0 < el.scrollLeft + frozenW) el.scrollLeft = Math.max(0, x0 - frozenW);
        else if (x1 > el.scrollLeft + viewW) el.scrollLeft = x1 - viewW;
      }
      if (r >= fr) {
        const y0 = rows.offset(r);
        const y1 = y0 + rows.size(r);
        if (y0 < el.scrollTop + frozenH) el.scrollTop = Math.max(0, y0 - frozenH);
        else if (y1 > el.scrollTop + viewH) el.scrollTop = y1 - viewH;
      }
    },
    [cols, rows, fc, fr, frozenW, frozenH],
  );

  const sel = ctl.sel;
  useEffect(() => {
    scrollToCell(sel.r, sel.c);
  }, [sel.r, sel.c, scrollToCell]);

  // ---------- Interacción con el ratón ----------

  const drag = useRef<null | { kind: 'select' | 'fill' | 'colsel' | 'rowsel'; start: { r: number; c: number } }>(null);

  const startResize = (axis: 'col' | 'row', index: number, startPos: number) => {
    const startSize = axis === 'col' ? cols.size(index) : rows.size(index);
    let size = startSize;
    const move = (e: MouseEvent) => {
      size = Math.max(axis === 'col' ? 20 : 12, startSize + ((axis === 'col' ? e.clientX : e.clientY) - startPos));
      setResizePreview({ axis, index, size });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setResizePreview(null);
      if (size !== startSize) {
        const targets = axis === 'col' && sel.range.c1 <= index && index <= sel.range.c2 && sel.range.r1 === 0 && sel.range.r2 >= sheet.rowCount - 1
          ? Array.from({ length: sel.range.c2 - sel.range.c1 + 1 }, (_, i) => sel.range.c1 + i)
          : [index];
        ctl.sheetOp(axis === 'col' ? 'Ancho de columna' : 'Alto de fila', (s) => {
          for (const t of targets) {
            if (axis === 'col') s.colWidths[t] = Math.round(size);
            else s.rowHeights[t] = Math.round(size);
          }
        }, { rebuild: false });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      // Clic derecho: seleccionar la celda si está fuera de la selección
      const h = hitTest(e.clientX, e.clientY);
      if (h.px < HEADER_W || h.py < HEADER_H) return;
      const inSel = h.r >= sel.range.r1 && h.r <= sel.range.r2 && h.c >= sel.range.c1 && h.c <= sel.range.c2;
      if (!inSel) ctl.select(h.r, h.c);
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.cell-editor, .chart-box, .cell-btn, .fn-hints')) return;
    const h = hitTest(e.clientX, e.clientY);
    // Bordes de encabezado: redimensionar
    if (h.py < HEADER_H && h.px >= HEADER_W) {
      const rightEdge = screenRect(0, h.c).left + cols.size(h.c);
      const leftEdge = screenRect(0, h.c).left;
      if (Math.abs(h.px - rightEdge) <= 4) {
        e.preventDefault();
        startResize('col', h.c, e.clientX);
        return;
      }
      if (Math.abs(h.px - leftEdge) <= 4 && h.c > 0) {
        e.preventDefault();
        startResize('col', h.c - 1, e.clientX);
        return;
      }
    }
    if (h.px < HEADER_W && h.py >= HEADER_H) {
      const bottom = screenRect(h.r, 0).top + rows.size(h.r);
      if (Math.abs(h.py - bottom) <= 3) {
        e.preventDefault();
        startResize('row', h.r, e.clientY);
        return;
      }
    }
    if (edit) {
      // Modo de referencia: al editar una fórmula, el clic inserta la referencia
      if (edit.value.startsWith('=') && /[=(,;+\-*/^&<>:]\s*$/.test(edit.value) && h.px >= HEADER_W && h.py >= HEADER_H) {
        e.preventDefault();
        const prefix = edit.value;
        const ref = `${colToLetters(h.c)}${h.r + 1}`;
        setEdit({ ...edit, value: prefix + ref });
        const start = h;
        const move = (ev: MouseEvent) => {
          const hh = hitTest(ev.clientX, ev.clientY);
          const rr = normalizeRange({ r1: start.r, c1: start.c, r2: hh.r, c2: hh.c });
          setEdit({ ...edit, value: prefix + rangeName(rr) });
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          props.editorRef.current?.focus();
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return;
      }
      commitEdit(null);
    }
    props.setSelectedChart(null);
    if (target.closest('.fill-handle')) {
      e.preventDefault();
      drag.current = { kind: 'fill', start: { r: sel.range.r2, c: sel.range.c2 } };
    } else if (h.py < HEADER_H && h.px < HEADER_W) {
      ctl.selectRange({ r1: 0, c1: 0, r2: sheet.rowCount - 1, c2: sheet.colCount - 1 }, { r: 0, c: 0 });
    } else if (h.py < HEADER_H) {
      e.preventDefault();
      const r0 = e.shiftKey ? { r1: 0, c1: Math.min(sel.c, h.c), r2: sheet.rowCount - 1, c2: Math.max(sel.c, h.c) } : { r1: 0, c1: h.c, r2: sheet.rowCount - 1, c2: h.c };
      ctl.selectRange(r0, { r: e.shiftKey ? sel.r : 0, c: e.shiftKey ? sel.c : h.c });
      drag.current = { kind: 'colsel', start: { r: 0, c: e.shiftKey ? sel.c : h.c } };
    } else if (h.px < HEADER_W) {
      e.preventDefault();
      const r0 = e.shiftKey ? { r1: Math.min(sel.r, h.r), c1: 0, r2: Math.max(sel.r, h.r), c2: sheet.colCount - 1 } : { r1: h.r, c1: 0, r2: h.r, c2: sheet.colCount - 1 };
      ctl.selectRange(r0, { r: e.shiftKey ? sel.r : h.r, c: e.shiftKey ? sel.c : 0 });
      drag.current = { kind: 'rowsel', start: { r: e.shiftKey ? sel.r : h.r, c: 0 } };
    } else {
      e.preventDefault();
      ctl.select(h.r, h.c, e.shiftKey);
      drag.current = { kind: 'select', start: e.shiftKey ? { r: sel.r, c: sel.c } : { r: h.r, c: h.c } };
    }
    gridRef.current?.focus({ preventScroll: true });
    const move = (ev: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const hh = hitTest(ev.clientX, ev.clientY);
      if (d.kind === 'select') ctl.selectRange({ r1: d.start.r, c1: d.start.c, r2: hh.r, c2: hh.c }, d.start);
      else if (d.kind === 'colsel') ctl.selectRange({ r1: 0, c1: d.start.c, r2: sheet.rowCount - 1, c2: hh.c }, d.start);
      else if (d.kind === 'rowsel') ctl.selectRange({ r1: d.start.r, c1: 0, r2: hh.r, c2: sheet.colCount - 1 }, d.start);
      else if (d.kind === 'fill') {
        const s = ctl.sel.range;
        const dr = hh.r > s.r2 ? hh.r - s.r2 : hh.r < s.r1 ? hh.r - s.r1 : 0;
        const dc = hh.c > s.c2 ? hh.c - s.c2 : hh.c < s.c1 ? hh.c - s.c1 : 0;
        if (Math.abs(dr) >= Math.abs(dc) && dr !== 0) setFillPreview(dr > 0 ? { ...s, r2: hh.r } : { ...s, r1: hh.r });
        else if (dc !== 0) setFillPreview(dc > 0 ? { ...s, c2: hh.c } : { ...s, c1: hh.c });
        else setFillPreview(null);
      }
      // Desplazamiento automático en los bordes
      const el = scrollRef.current!;
      const rect = el.getBoundingClientRect();
      if (ev.clientY > rect.bottom - 20) el.scrollTop += 20;
      else if (ev.clientY < rect.top + HEADER_H + 10 && el.scrollTop > 0) el.scrollTop -= 20;
      if (ev.clientX > rect.right - 20) el.scrollLeft += 20;
      else if (ev.clientX < rect.left + HEADER_W + 10 && el.scrollLeft > 0) el.scrollLeft -= 20;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = drag.current;
      drag.current = null;
      if (d?.kind === 'fill') {
        setFillPreview((fp) => {
          if (fp) props.onFill(ctl.sel.range, fp);
          return null;
        });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const h = hitTest(e.clientX, e.clientY);
    if ((e.target as HTMLElement).closest('.chart-box, .cell-editor')) return;
    if (h.py < HEADER_H && h.px >= HEADER_W) {
      const rightEdge = screenRect(0, h.c).left + cols.size(h.c);
      if (Math.abs(h.px - rightEdge) <= 4) props.autoFit('col', h.c);
      else if (Math.abs(h.px - screenRect(0, h.c).left) <= 4 && h.c > 0) props.autoFit('col', h.c - 1);
      return;
    }
    if (h.px < HEADER_W && h.py >= HEADER_H) {
      if (Math.abs(h.py - (screenRect(h.r, 0).top + rows.size(h.r))) <= 3) props.autoFit('row', h.r);
      return;
    }
    if (h.px >= HEADER_W && h.py >= HEADER_H) {
      const m = ctl.mergeAt(h.r, h.c);
      const r = m ? m.r1 : h.r;
      const c = m ? m.c1 : h.c;
      setEdit({ r, c, value: ctl.rawInput(r, c), mode: 'edit' });
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cell-editor, .chart-box')) return;
    e.preventDefault();
    const h = hitTest(e.clientX, e.clientY);
    if (h.py < HEADER_H && h.px >= HEADER_W) {
      if (!(sel.range.c1 <= h.c && h.c <= sel.range.c2 && sel.range.r1 === 0)) ctl.selectRange({ r1: 0, c1: h.c, r2: sheet.rowCount - 1, c2: h.c }, { r: 0, c: h.c });
      props.onHeaderContextMenu({ kind: 'col', index: h.c }, e.clientX, e.clientY);
    } else if (h.px < HEADER_W && h.py >= HEADER_H) {
      if (!(sel.range.r1 <= h.r && h.r <= sel.range.r2 && sel.range.c1 === 0)) ctl.selectRange({ r1: h.r, c1: 0, r2: h.r, c2: sheet.colCount - 1 }, { r: h.r, c: 0 });
      props.onHeaderContextMenu({ kind: 'row', index: h.r }, e.clientX, e.clientY);
    } else props.onCellContextMenu(e.clientX, e.clientY);
  };

  // ---------- Renderizado ----------

  const overscan = 2;
  const vis = {
    r1: Math.max(fr, rows.indexAt(scroll.top + frozenH) - overscan),
    r2: Math.min(sheet.rowCount - 1, rows.indexAt(scroll.top + scroll.h) + overscan),
    c1: Math.max(fc, cols.indexAt(scroll.left + frozenW) - overscan),
    c2: Math.min(sheet.colCount - 1, cols.indexAt(scroll.left + scroll.w) + overscan),
  };

  const merges = sheet.merges;
  const mergeAnchor = useMemo(() => {
    const covered = new Map<string, RangeAddr>();
    for (const m of merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) covered.set(cellKey(r, c), m);
    return covered;
  }, [merges]);

  const filter = sheet.filter;
  const validationAt = (r: number, c: number) => sheet.validations.find((v) => v.type === 'list' && r >= v.range.r1 && r <= v.range.r2 && c >= v.range.c1 && c <= v.range.c2);

  const renderCells = (r1: number, r2: number, c1: number, c2: number) => {
    const out: React.ReactNode[] = [];
    const done = new Set<RangeAddr>();
    const draw = (r: number, c: number, m?: RangeAddr) => {
      if (hidden.has(r) && !m) return;
      const d = cellDisplay(ctl, sheet, r, c);
      const st = d.style;
      const left = HEADER_W + cols.offset(c);
      const top = HEADER_H + rows.offset(r);
      const width = m ? cols.offset(m.c2 + 1) - cols.offset(m.c1) : cols.size(c);
      const height = m ? rows.offset(m.r2 + 1) - rows.offset(m.r1) : rows.size(r);
      if (height <= 0) return;
      const inSel = r >= sel.range.r1 && r <= sel.range.r2 && c >= sel.range.c1 && c <= sel.range.c2;
      const isActive = r === sel.r && c === sel.c;
      let overflow: number | undefined;
      if (d.text && !st.wrap && d.align === 'left' && typeof d.value === 'string' && !m) {
        let w = width;
        let cc = c + 1;
        while (cc < sheet.colCount && cc <= c + 12 && w < 2000) {
          const nb = sheet.cells[cellKey(r, cc)];
          if ((nb && (nb.v !== undefined || nb.f !== undefined)) || mergeAnchor.has(cellKey(r, cc))) break;
          w += cols.size(cc);
          cc++;
        }
        if (w > width) overflow = w;
      }
      const b = st.borders;
      const css: React.CSSProperties = {
        left,
        top,
        width,
        height,
        background: st.bg,
        color: d.color ?? st.color,
        fontWeight: st.bold ? 700 : undefined,
        fontStyle: st.italic ? 'italic' : undefined,
        textDecoration: [st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
        fontSize: st.fontSize ? `${st.fontSize}pt` : undefined,
        fontFamily: st.fontFamily,
        justifyContent: d.align === 'center' ? 'center' : d.align === 'right' ? 'flex-end' : 'flex-start',
        alignItems: st.vAlign === 'top' ? 'flex-start' : st.vAlign === 'middle' ? 'center' : 'flex-end',
        whiteSpace: st.wrap ? 'pre-wrap' : 'pre',
        borderTop: b?.top ? borderCss(b.top) : undefined,
        borderLeft: b?.left ? borderCss(b.left) : undefined,
        borderRight: b?.right ? borderCss(b.right) : undefined,
        borderBottom: b?.bottom ? borderCss(b.bottom) : undefined,
        zIndex: overflow ? 1 : undefined,
      };
      const isFilterHeader = filter && r === filter.range.r1 && c >= filter.range.c1 && c <= filter.range.c2;
      const listRule = isActive ? validationAt(r, c) : undefined;
      out.push(
        <div
          key={`${r}:${c}`}
          className={`cell ${inSel ? 'in-sel' : ''} ${st.bg ? 'has-bg' : ''} ${m ? 'merged' : ''} ${d.error ? 'is-error' : ''}`}
          style={css}
          data-r={r}
          data-c={c}
          title={d.error}
        >
          <span className="cell-text" style={overflow ? { width: overflow - 6, overflow: 'hidden' } : undefined}>
            {d.text}
          </span>
          {isFilterHeader && (
            <button
              type="button"
              className={`cell-btn filter-btn ${filter.hidden[c]?.length ? 'is-active' : ''}`}
              aria-label={`Filtrar columna ${colToLetters(c)}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => props.onFilterMenu(c, e.currentTarget)}
            >
              {filter.hidden[c]?.length ? <Filter size={11} /> : <ChevronDown size={12} />}
            </button>
          )}
          {listRule && (
            <button
              type="button"
              className="cell-btn list-btn"
              aria-label="Elegir de la lista"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => props.onListMenu(r, c, e.currentTarget)}
            >
              <ChevronDown size={12} />
            </button>
          )}
        </div>,
      );
    };
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const m = mergeAnchor.get(cellKey(r, c));
        if (m) {
          if (done.has(m)) continue;
          done.add(m);
          draw(m.r1, m.c1, m);
          continue;
        }
        draw(r, c);
      }
    }
    return out;
  };

  const selRect = (range: RangeAddr) => ({
    left: HEADER_W + cols.offset(range.c1),
    top: HEADER_H + rows.offset(range.r1),
    width: cols.offset(range.c2 + 1) - cols.offset(range.c1),
    height: rows.offset(range.r2 + 1) - rows.offset(range.r1),
  });

  const activeRange = ctl.mergeAt(sel.r, sel.c) ?? { r1: sel.r, c1: sel.c, r2: sel.r, c2: sel.c };
  const selection = (
    <>
      <div className="sel-range" style={selRect(sel.range)} />
      <div className="sel-active" style={selRect(activeRange)} />
      {!edit && (
        <div
          className="fill-handle"
          style={{ left: selRect(sel.range).left + selRect(sel.range).width - 4, top: selRect(sel.range).top + selRect(sel.range).height - 4 }}
          title="Arrastra para rellenar"
        />
      )}
      {fillPreview && <div className="fill-preview" style={selRect(fillPreview)} />}
    </>
  );

  const colHeaders = (c1: number, c2: number) => {
    const out: React.ReactNode[] = [];
    for (let c = c1; c <= c2; c++) {
      const active = c >= sel.range.c1 && c <= sel.range.c2;
      out.push(
        <div key={c} className={`col-header ${active ? 'is-active' : ''}`} style={{ left: HEADER_W + cols.offset(c), width: cols.size(c), height: HEADER_H }}>
          {colToLetters(c)}
        </div>,
      );
    }
    return out;
  };
  const rowHeaders = (r1: number, r2: number) => {
    const out: React.ReactNode[] = [];
    for (let r = r1; r <= r2; r++) {
      if (hidden.has(r)) continue;
      const active = r >= sel.range.r1 && r <= sel.range.r2;
      out.push(
        <div key={r} className={`row-header ${active ? 'is-active' : ''}`} style={{ top: HEADER_H + rows.offset(r), height: rows.size(r), width: HEADER_W }}>
          {r + 1}
        </div>,
      );
    }
    return out;
  };

  const canvasW = HEADER_W + cols.total;
  const canvasH = HEADER_H + rows.total;
  const bandH = HEADER_H + frozenH;
  const bandW = HEADER_W + frozenW;

  const editRect = edit ? (() => {
    const m = ctl.mergeAt(edit.r, edit.c);
    return screenRect(edit.r, edit.c, m?.r2 ?? edit.r, m?.c2 ?? edit.c);
  })() : null;
  const editStyle = edit ? (() => {
    const st = ctl.styleOf(ctl.getCell(edit.r, edit.c));
    return { fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', fontSize: st.fontSize ? `${st.fontSize}pt` : undefined, fontFamily: st.fontFamily, color: st.color, background: st.bg ?? '#fff' } as React.CSSProperties;
  })() : {};

  return (
    <div className="grid-wrap">
      <div
        ref={(el) => {
          scrollRef.current = el;
          (gridRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={`grid-scroll ${sheet.gridlines === false ? 'no-gridlines' : ''}`}
        tabIndex={0}
        role="grid"
        aria-label={`Hoja ${sheet.name}`}
        aria-rowcount={sheet.rowCount}
        aria-colcount={sheet.colCount}
        aria-activedescendant={undefined}
        onScroll={onScroll}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={props.onKey}
        onMouseMove={(e) => {
          const h = hitTest(e.clientX, e.clientY);
          const el = e.currentTarget;
          let cursor = '';
          if (h.py < HEADER_H && h.px >= HEADER_W) {
            const left = screenRect(0, h.c).left;
            if (Math.abs(h.px - (left + cols.size(h.c))) <= 4 || (Math.abs(h.px - left) <= 4 && h.c > 0)) cursor = 'col-resize';
          } else if (h.px < HEADER_W && h.py >= HEADER_H && Math.abs(h.py - (screenRect(h.r, 0).top + rows.size(h.r))) <= 3) cursor = 'row-resize';
          if (el.style.cursor !== cursor) el.style.cursor = cursor;
        }}
      >
        <div className="grid-canvas" style={{ width: canvasW, height: canvasH }}>
          {/* Capa del cuerpo (se desplaza en ambas direcciones) */}
          <div className="layer-body">
            {renderCells(vis.r1, vis.r2, vis.c1, vis.c2)}
            {selection}
            <ChartLayer ctl={ctl} sheet={sheet} version={version} selected={props.selectedChart} onSelect={props.setSelectedChart} onEdit={props.onEditChart} originX={HEADER_W} originY={HEADER_H} />
          </div>
          {/* Filas inmovilizadas + encabezados de columna */}
          <div className="layer-top" style={{ width: canvasW }}>
            <div className="band" style={{ width: canvasW, height: bandH }}>
              {fr > 0 && renderCells(0, fr - 1, vis.c1, vis.c2)}
              {fr > 0 && selection}
              {colHeaders(vis.c1, vis.c2)}
              {fr > 0 && <div className="freeze-line-h" style={{ top: bandH - 1, width: canvasW }} />}
            </div>
          </div>
          {/* Columnas inmovilizadas + encabezados de fila */}
          <div className="layer-left" style={{ height: canvasH }}>
            <div className="band" style={{ width: bandW, height: canvasH }}>
              {fc > 0 && renderCells(vis.r1, vis.r2, 0, fc - 1)}
              {fc > 0 && selection}
              {rowHeaders(vis.r1, vis.r2)}
              {fc > 0 && <div className="freeze-line-v" style={{ left: bandW - 1, height: canvasH }} />}
            </div>
          </div>
          {/* Esquina */}
          <div className="layer-corner">
            <div className="band" style={{ width: bandW, height: bandH }}>
              {fr > 0 && fc > 0 && renderCells(0, fr - 1, 0, fc - 1)}
              {fr > 0 && fc > 0 && selection}
              {fc > 0 && colHeaders(0, fc - 1)}
              {fr > 0 && rowHeaders(0, fr - 1)}
              <div className="corner-header" style={{ width: HEADER_W, height: HEADER_H }} title="Seleccionar todo" />
              {fr > 0 && <div className="freeze-line-h" style={{ top: bandH - 1, width: bandW }} />}
              {fc > 0 && <div className="freeze-line-v" style={{ left: bandW - 1, height: bandH }} />}
            </div>
          </div>
        </div>
      </div>
      {edit && editRect && (
        <CellEditor
          edit={edit}
          rect={editRect}
          style={editStyle}
          inputRef={props.editorRef}
          onChange={(value) => setEdit({ ...edit, value })}
          onCommit={commitEdit}
          onCancel={() => {
            setEdit(null);
            gridRef.current?.focus();
          }}
          onModeEdit={() => edit.mode !== 'edit' && setEdit({ ...edit, mode: 'edit' })}
        />
      )}
    </div>
  );
}

function borderCss(b: { style: string; color: string }): string {
  const w = b.style === 'thick' ? 3 : b.style === 'medium' ? 2 : b.style === 'double' ? 3 : 1;
  const s = b.style === 'dashed' ? 'dashed' : b.style === 'dotted' ? 'dotted' : b.style === 'double' ? 'double' : 'solid';
  return `${w}px ${s} ${b.color}`;
}

export { measureFontCss };
