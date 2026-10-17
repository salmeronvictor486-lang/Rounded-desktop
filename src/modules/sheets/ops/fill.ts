import { shiftFormula } from '../engine/parser';
import { cellKey, type CellData, type RangeAddr } from '../model';
import type { SheetController } from '../controller';

/**
 * Rellena `target` a partir de `source` (tirador de relleno). Detecta series
 * lineales numéricas o de fechas cuando hay dos o más valores; si no, copia
 * repitiendo el patrón y desplazando las fórmulas relativas.
 */
export function fillRange(ctl: SheetController, source: RangeAddr, target: RangeAddr) {
  const updates = new Map<string, CellData | undefined>();
  const vertical = target.c1 === source.c1 && target.c2 === source.c2;
  const sheet = ctl.sheet;
  if (vertical) {
    const h = source.r2 - source.r1 + 1;
    const down = target.r2 > source.r2;
    for (let c = source.c1; c <= source.c2; c++) {
      const series = numericSeries(ctl, source.r1, source.r2, c, true);
      const rows = down ? range(source.r2 + 1, target.r2) : range(target.r1, source.r1 - 1).reverse();
      rows.forEach((r, i) => {
        const offset = down ? i : -(i + 1);
        const srcR = down ? source.r1 + (i % h) : source.r2 - (i % h);
        const src = sheet.cells[cellKey(srcR, c)];
        updates.set(cellKey(r, c), fillOne(src, r - srcR, 0, series, offset));
      });
    }
  } else {
    const w = source.c2 - source.c1 + 1;
    const right = target.c2 > source.c2;
    for (let r = source.r1; r <= source.r2; r++) {
      const series = numericSeries(ctl, source.c1, source.c2, r, false);
      const cols = right ? range(source.c2 + 1, target.c2) : range(target.c1, source.c1 - 1).reverse();
      cols.forEach((c, i) => {
        const offset = right ? i : -(i + 1);
        const srcC = right ? source.c1 + (i % w) : source.c2 - (i % w);
        const src = sheet.cells[cellKey(r, srcC)];
        updates.set(cellKey(r, c), fillOne(src, 0, c - srcC, series, offset));
      });
    }
  }
  ctl.applyCells('Rellenar', updates);
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

interface Series {
  last: number;
  first: number;
  step: number;
}

function numericSeries(ctl: SheetController, a: number, b: number, fixed: number, vertical: boolean): Series | null {
  const vals: number[] = [];
  for (let i = a; i <= b; i++) {
    const cell = vertical ? ctl.getCell(i, fixed) : ctl.getCell(fixed, i);
    if (!cell || cell.f !== undefined || typeof cell.v !== 'number') return null;
    vals.push(cell.v);
  }
  if (vals.length < 2) return null;
  const step = vals[1] - vals[0];
  for (let i = 2; i < vals.length; i++) if (Math.abs(vals[i] - vals[i - 1] - step) > 1e-9) return null;
  return { first: vals[0], last: vals[vals.length - 1], step };
}

function fillOne(src: CellData | undefined, dr: number, dc: number, series: Series | null, offset: number): CellData | undefined {
  if (!src) return undefined;
  if (src.f !== undefined) return { ...src, f: shiftFormula(src.f, dr, dc) };
  if (series) {
    const v = offset >= 0 ? series.last + series.step * (offset + 1) : series.first + series.step * offset;
    return { ...src, v: Number(v.toPrecision(15)) };
  }
  // Texto terminado en número: "Semana 1" → "Semana 2"
  if (typeof src.v === 'string') {
    const m = /^(.*?)(\d+)$/.exec(src.v);
    if (m && (dr !== 0 || dc !== 0)) {
      const step = dr !== 0 ? dr : dc;
      const n = Number(m[2]) + step;
      if (n >= 0) return { ...src, v: `${m[1]}${String(n).padStart(m[2].length, '0')}` };
    }
  }
  return { ...src };
}
