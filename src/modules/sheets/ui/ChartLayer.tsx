import { useRef, useState } from 'react';
import type { ChartDef, Sheet } from '../model';
import type { SheetController } from '../controller';
import { ChartSvg, chartData } from '../charts';

interface Props {
  ctl: SheetController;
  sheet: Sheet;
  version: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (c: ChartDef) => void;
  originX: number;
  originY: number;
}

/** Gráficos flotantes sobre la hoja: se mueven y redimensionan con el ratón. */
export function ChartLayer({ ctl, sheet, selected, onSelect, onEdit, originX, originY }: Props) {
  const [live, setLive] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<null | { id: string; mode: string; sx: number; sy: number; orig: ChartDef }>(null);

  const begin = (e: React.MouseEvent, chart: ChartDef, mode: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(chart.id);
    dragRef.current = { id: chart.id, mode, sx: e.clientX, sy: e.clientY, orig: chart };
    let latest = { id: chart.id, x: chart.x, y: chart.y, w: chart.w, h: chart.h };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      const o = d.orig;
      let { x, y, w, h } = o;
      if (d.mode === 'move') {
        x = Math.max(0, o.x + dx);
        y = Math.max(0, o.y + dy);
      } else {
        if (d.mode.includes('e')) w = Math.max(160, o.w + dx);
        if (d.mode.includes('s')) h = Math.max(120, o.h + dy);
        if (d.mode.includes('w')) {
          w = Math.max(160, o.w - dx);
          x = o.x + (o.w - w);
        }
        if (d.mode.includes('n')) {
          h = Math.max(120, o.h - dy);
          y = o.y + (o.h - h);
        }
      }
      latest = { id: o.id, x, y, w, h };
      setLive(latest);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = dragRef.current;
      dragRef.current = null;
      setLive(null);
      if (!d) return;
      const o = d.orig;
      if (latest.x !== o.x || latest.y !== o.y || latest.w !== o.w || latest.h !== o.h) {
        ctl.sheetOp(d.mode === 'move' ? 'Mover gráfico' : 'Cambiar tamaño del gráfico', (s) => {
          const c = s.charts.find((x) => x.id === o.id);
          if (c) Object.assign(c, { x: Math.round(latest.x), y: Math.round(latest.y), w: Math.round(latest.w), h: Math.round(latest.h) });
        }, { rebuild: false });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <>
      {sheet.charts.map((chart) => {
        const pos = live?.id === chart.id ? live : chart;
        const isSel = selected === chart.id;
        const data = chartData(ctl, chart, sheet.id);
        return (
          <div
            key={chart.id}
            className={`chart-box ${isSel ? 'is-selected' : ''}`}
            style={{ left: originX + pos.x, top: originY + pos.y, width: pos.w, height: pos.h }}
            onMouseDown={(e) => begin(e, chart, 'move')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onEdit(chart);
            }}
            role="figure"
            aria-label={`Gráfico: ${chart.title || chart.type}`}
            tabIndex={-1}
          >
            <ChartSvg chart={chart} data={data} width={pos.w} height={pos.h} />
            {isSel &&
              ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => (
                <span key={h} className={`chart-handle h-${h}`} onMouseDown={(e) => begin(e, chart, h)} />
              ))}
          </div>
        );
      })}
    </>
  );
}
