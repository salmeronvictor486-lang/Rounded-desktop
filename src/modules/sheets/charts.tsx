import { useMemo } from 'react';
import { parseRangeRef } from './engine/address';
import { isError, type Value } from './engine/values';
import { formatValue } from './format/numberFormat';
import type { ChartDef, ChartType } from './model';
import type { SheetController } from './controller';

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'column', label: 'Columnas' },
  { id: 'bar', label: 'Barras' },
  { id: 'line', label: 'Líneas' },
  { id: 'area', label: 'Área' },
  { id: 'pie', label: 'Circular' },
  { id: 'scatter', label: 'Dispersión' },
];

export const SERIES_COLORS = ['#4f46e5', '#059669', '#ea580c', '#e11d48', '#0891b2', '#ca8a04', '#7c3aed', '#64748b'];

export interface ChartData {
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
  error?: string;
}

/** Extrae categorías y series del rango del gráfico. */
export function chartData(ctl: SheetController, chart: ChartDef, sheetId: string): ChartData {
  const ref = parseRangeRef(chart.range);
  if (!ref) return { categories: [], series: [], error: 'Rango no válido' };
  const sheet = ref.sheet ? ctl.engine.sheetByName(ref.sheet) : ctl.wb.sheets.find((s) => s.id === sheetId);
  if (!sheet) return { categories: [], series: [], error: 'La hoja del rango no existe' };
  const { r1, c1 } = ref.range;
  const r2 = Math.min(ref.range.r2, r1 + 2000);
  const c2 = Math.min(ref.range.c2, c1 + 50);
  const grid: Value[][] = [];
  for (let r = r1; r <= r2; r++) {
    const row: Value[] = [];
    for (let c = c1; c <= c2; c++) row.push(ctl.engine.getValue(sheet.id, r, c));
    grid.push(row);
  }
  const text = (v: Value) => (v === null ? '' : isError(v) ? v.code : formatValue(v, undefined).text);
  const matrix = chart.seriesIn === 'columns' ? grid : grid[0]?.map((_, c) => grid.map((row) => row[c])) ?? [];
  // matrix: filas = categorías, columnas = series
  const height = matrix.length;
  const width = matrix[0]?.length ?? 0;
  if (!height || !width) return { categories: [], series: [] };
  const firstColIsLabels = width > 1 && matrix.slice(chart.headers ? 1 : 0).some((r) => typeof r[0] === 'string');
  const startRow = chart.headers ? 1 : 0;
  const startCol = firstColIsLabels ? 1 : 0;
  const categories = matrix.slice(startRow).map((r, i) => (firstColIsLabels ? text(r[0]) : String(i + 1)));
  const series = [];
  for (let c = startCol; c < width; c++) {
    series.push({
      name: chart.headers ? text(matrix[0][c]) || `Serie ${c - startCol + 1}` : `Serie ${c - startCol + 1}`,
      values: matrix.slice(startRow).map((r) => (typeof r[c] === 'number' ? (r[c] as number) : null)),
    });
  }
  return { categories, series };
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    max = min + 1;
    min = Math.min(0, min);
  }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function shortNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1).replace('.0', '')} mm`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '')} M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)} mil`;
  return formatValue(n, a < 10 && !Number.isInteger(n) ? '0.##' : '#,##0').text;
}

/** Gráfico SVG (se usa en la hoja, en las miniaturas y en la exportación a imagen). */
export function ChartSvg({ chart, data, width, height }: { chart: ChartDef; data: ChartData; width: number; height: number }) {
  const pad = { t: chart.title ? 34 : 14, r: 16, b: 36, l: 52 };
  const legendH = chart.legend && data.series.length > 0 && chart.type !== 'pie' ? 22 : 0;
  const W = width;
  const H = height;
  const plotW = Math.max(10, W - pad.l - pad.r);
  const plotH = Math.max(10, H - pad.t - pad.b - legendH);
  const all = data.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const body = useMemo(() => {
    if (data.error) return <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="#dc2626">{data.error}</text>;
    if (!all.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="#888">Sin datos numéricos en el rango</text>;
    if (chart.type === 'pie') {
      const s = data.series[0];
      const vals = s.values.map((v) => Math.max(0, v ?? 0));
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = W / 2 - (chart.legend ? 60 : 0);
      const cy = pad.t + plotH / 2 + legendH / 2;
      const rad = Math.max(10, Math.min(plotW - (chart.legend ? 120 : 0), plotH + legendH) / 2 - 4);
      let a0 = -Math.PI / 2;
      return (
        <g>
          {vals.map((v, i) => {
            const a1 = a0 + (v / total) * Math.PI * 2;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const d = vals.length === 1 || v === total
              ? `M ${cx - rad} ${cy} a ${rad} ${rad} 0 1 0 ${rad * 2} 0 a ${rad} ${rad} 0 1 0 ${-rad * 2} 0`
              : `M ${cx} ${cy} L ${cx + rad * Math.cos(a0)} ${cy + rad * Math.sin(a0)} A ${rad} ${rad} 0 ${large} 1 ${cx + rad * Math.cos(a1)} ${cy + rad * Math.sin(a1)} Z`;
            const mid = (a0 + a1) / 2;
            const el = (
              <g key={i}>
                <path d={d} fill={SERIES_COLORS[i % SERIES_COLORS.length]} stroke="#fff" strokeWidth="1.5">
                  <title>{`${data.categories[i]}: ${v}`}</title>
                </path>
                {v / total > 0.06 && (
                  <text x={cx + rad * 0.65 * Math.cos(mid)} y={cy + rad * 0.65 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#fff" fontWeight="600">
                    {Math.round((v / total) * 100)}%
                  </text>
                )}
              </g>
            );
            a0 = a1;
            return el;
          })}
          {chart.legend &&
            data.categories.slice(0, 12).map((c, i) => (
              <g key={`l${i}`} transform={`translate(${W - 140}, ${pad.t + 6 + i * 18})`}>
                <rect width="10" height="10" rx="2" fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                <text x="16" y="9" fontSize="11" fill="#444">{c.length > 18 ? `${c.slice(0, 17)}…` : c}</text>
              </g>
            ))}
        </g>
      );
    }
    const horizontal = chart.type === 'bar';
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const n = data.categories.length;
    const scale = (v: number) => ((v - lo) / (hi - lo || 1)) * (horizontal ? plotW : plotH);
    const band = (horizontal ? plotH : plotW) / Math.max(1, n);
    const els: React.ReactNode[] = [];
    // Ejes y rejilla
    ticks.forEach((t, i) => {
      const p = scale(t);
      els.push(
        horizontal ? (
          <g key={`t${i}`}>
            <line x1={pad.l + p} x2={pad.l + p} y1={pad.t} y2={pad.t + plotH} stroke="#e5e7eb" />
            <text x={pad.l + p} y={pad.t + plotH + 14} textAnchor="middle" fontSize="10" fill="#666">{shortNum(t)}</text>
          </g>
        ) : (
          <g key={`t${i}`}>
            <line x1={pad.l} x2={pad.l + plotW} y1={pad.t + plotH - p} y2={pad.t + plotH - p} stroke="#e5e7eb" />
            <text x={pad.l - 6} y={pad.t + plotH - p + 3} textAnchor="end" fontSize="10" fill="#666">{shortNum(t)}</text>
          </g>
        ),
      );
    });
    const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((horizontal ? plotH : plotW) / 60))));
    data.categories.forEach((cat, i) => {
      if (i % labelEvery) return;
      const label = cat.length > 12 ? `${cat.slice(0, 11)}…` : cat;
      els.push(
        horizontal ? (
          <text key={`c${i}`} x={pad.l - 6} y={pad.t + band * i + band / 2 + 3} textAnchor="end" fontSize="10" fill="#666">{label}</text>
        ) : (
          <text key={`c${i}`} x={pad.l + band * i + band / 2} y={pad.t + plotH + 14} textAnchor="middle" fontSize="10" fill="#666">{label}</text>
        ),
      );
    });
    const zero = scale(0);
    if (chart.type === 'column' || chart.type === 'bar') {
      const k = data.series.length;
      const bw = (band * 0.75) / k;
      data.series.forEach((s, si) =>
        s.values.forEach((v, i) => {
          if (v === null) return;
          const p = scale(v);
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const off = band * 0.125 + si * bw;
          els.push(
            horizontal ? (
              <rect key={`b${si}-${i}`} x={pad.l + Math.min(zero, p)} y={pad.t + band * i + off} width={Math.abs(p - zero)} height={Math.max(1, bw - 1)} fill={color} rx="2">
                <title>{`${s.name} · ${data.categories[i]}: ${v}`}</title>
              </rect>
            ) : (
              <rect key={`b${si}-${i}`} x={pad.l + band * i + off} y={pad.t + plotH - Math.max(zero, p)} width={Math.max(1, bw - 1)} height={Math.abs(p - zero)} fill={color} rx="2">
                <title>{`${s.name} · ${data.categories[i]}: ${v}`}</title>
              </rect>
            ),
          );
        }),
      );
    } else if (chart.type === 'scatter') {
      // X = primera serie, Y = resto
      const xs = data.series[0]?.values ?? [];
      const ys = data.series.slice(1);
      const xvals = xs.filter((v): v is number => v !== null);
      const xt = niceTicks(Math.min(...xvals, 0), Math.max(...xvals, 1));
      const sx = (v: number) => ((v - xt[0]) / (xt[xt.length - 1] - xt[0] || 1)) * plotW;
      (ys.length ? ys : data.series).forEach((s, si) =>
        s.values.forEach((v, i) => {
          const x = ys.length ? xs[i] : i + 1;
          if (v === null || x === null) return;
          els.push(<circle key={`p${si}-${i}`} cx={pad.l + (ys.length ? sx(x) : band * i + band / 2)} cy={pad.t + plotH - scale(v)} r="3.5" fill={SERIES_COLORS[(si + 1) % SERIES_COLORS.length]} />);
        }),
      );
    } else {
      data.series.forEach((s, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        const pts = s.values.map((v, i) => (v === null ? null : [pad.l + band * i + band / 2, pad.t + plotH - scale(v)] as const));
        const path = pts.reduce((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? ' L' : ' M'} ${p[0]} ${p[1]}` : acc), '');
        if (chart.type === 'area') {
          const valid = pts.filter(Boolean) as (readonly [number, number])[];
          if (valid.length) {
            const d = `M ${valid[0][0]} ${pad.t + plotH - zero} ${valid.map((p) => `L ${p[0]} ${p[1]}`).join(' ')} L ${valid[valid.length - 1][0]} ${pad.t + plotH - zero} Z`;
            els.push(<path key={`a${si}`} d={d} fill={color} fillOpacity="0.25" stroke="none" />);
          }
        }
        els.push(<path key={`l${si}`} d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />);
        pts.forEach((p, i) => p && els.push(<circle key={`c${si}-${i}`} cx={p[0]} cy={p[1]} r="2.8" fill={color}><title>{`${s.name} · ${data.categories[i]}: ${s.values[i]}`}</title></circle>));
      });
    }
    els.push(horizontal ? <line key="ax" x1={pad.l + zero} x2={pad.l + zero} y1={pad.t} y2={pad.t + plotH} stroke="#9ca3af" /> : <line key="ax" x1={pad.l} x2={pad.l + plotW} y1={pad.t + plotH - zero} y2={pad.t + plotH - zero} stroke="#9ca3af" />);
    return <g>{els}</g>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, data, W, H]);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title || 'Gráfico'} style={{ display: 'block', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {chart.title && (
        <text x={W / 2} y={22} textAnchor="middle" fontSize="14" fontWeight="600" fill="#222">
          {chart.title}
        </text>
      )}
      {body}
      {legendH > 0 && (
        <g transform={`translate(${pad.l}, ${H - 14})`}>
          {data.series.slice(0, 8).map((s, i) => (
            <g key={i} transform={`translate(${i * Math.min(140, plotW / Math.min(8, data.series.length))}, 0)`}>
              <rect y="-9" width="10" height="10" rx="2" fill={SERIES_COLORS[(chart.type === 'scatter' ? i + 1 : i) % SERIES_COLORS.length]} />
              <text x="15" y="0" fontSize="11" fill="#444">{s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
