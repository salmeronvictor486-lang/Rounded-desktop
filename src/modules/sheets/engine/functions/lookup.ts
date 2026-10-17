import { ERR, RangeValue, compareValues, isError, type EvalResult, type Value } from '../values';
import { makeCriterion, matrix, num, scalar, text } from './util';
import type { FnTable } from './types';

function eq(a: Value, b: Value): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b || (a === null && b === '') || (a === '' && b === null);
}

/** Búsqueda aproximada (datos ordenados ascendentes): último valor <= objetivo. */
function approxIndex(list: Value[], target: Value): number {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid];
    const c = v === null ? -1 : compareValues(v, target);
    if (c <= 0 && (typeof v === typeof target || v === null)) {
      ans = mid;
      lo = mid + 1;
    } else if (c <= 0) {
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function exactIndex(list: Value[], target: Value, wildcard: boolean): number {
  if (wildcard && typeof target === 'string' && /[*?~]/.test(target)) {
    const test = makeCriterion(`=${target}`);
    return list.findIndex((v) => test(v));
  }
  return list.findIndex((v) => eq(v, target));
}

export const LOOKUP: FnTable = {
  VLOOKUP: {
    min: 3,
    max: 4,
    impl: (a) => {
      const target = scalar(a[0]);
      if (isError(target)) return target;
      const rows = matrix(a[1]);
      const col = num(a[2]);
      if (isError(col)) return col;
      const approx = a.length > 3 ? scalar(a[3]) : true;
      const c = Math.trunc(col) - 1;
      if (c < 0) return ERR.value();
      if (c >= (rows[0]?.length ?? 0)) return ERR.ref();
      const first = rows.map((r) => r[0]);
      const i = approx && approx !== 0 ? approxIndex(first, target) : exactIndex(first, target, true);
      return i < 0 ? ERR.na(`No se encontró ${String(target)}`) : rows[i][c];
    },
  },
  HLOOKUP: {
    min: 3,
    max: 4,
    impl: (a) => {
      const target = scalar(a[0]);
      if (isError(target)) return target;
      const rows = matrix(a[1]);
      const row = num(a[2]);
      if (isError(row)) return row;
      const approx = a.length > 3 ? scalar(a[3]) : true;
      const r = Math.trunc(row) - 1;
      if (r < 0) return ERR.value();
      if (r >= rows.length) return ERR.ref();
      const first = rows[0] ?? [];
      const i = approx && approx !== 0 ? approxIndex(first, target) : exactIndex(first, target, true);
      return i < 0 ? ERR.na() : rows[r][i];
    },
  },
  XLOOKUP: {
    min: 3,
    max: 6,
    impl: (a) => {
      const target = scalar(a[0]);
      if (isError(target)) return target;
      const look = matrix(a[1]);
      const ret = matrix(a[2]);
      const notFound = a.length > 3 && a[3] !== null ? a[3] : null;
      const mode = a.length > 4 && a[4] !== null ? Number(scalar(a[4])) : 0;
      const searchMode = a.length > 5 && a[5] !== null ? Number(scalar(a[5])) : 1;
      const vertical = look.length > 1 || (look[0]?.length ?? 0) === 1;
      const list = vertical ? look.map((r) => r[0]) : look[0];
      let idx = -1;
      const order = searchMode < 0 ? [...list.keys()].reverse() : [...list.keys()];
      if (mode === 0 || mode === 2) {
        const test = mode === 2 ? makeCriterion(`=${String(target)}`) : (v: Value) => eq(v, target);
        idx = order.find((i) => test(list[i])) ?? -1;
      } else {
        let best = -1;
        for (const i of order) {
          const v = list[i];
          if (eq(v, target)) {
            best = i;
            break;
          }
          const c = compareValues(v, target);
          if (mode === -1 && c < 0 && (best < 0 || compareValues(v, list[best]) > 0)) best = i;
          if (mode === 1 && c > 0 && (best < 0 || compareValues(v, list[best]) < 0)) best = i;
        }
        idx = best;
      }
      if (idx < 0) return notFound ?? ERR.na();
      if (vertical) return ret[idx]?.length === 1 ? ret[idx][0] : new RangeValue([ret[idx] ?? []]);
      const column = ret.map((r) => [r[idx]]);
      return column.length === 1 ? column[0][0] : new RangeValue(column);
    },
  },
  MATCH: {
    min: 2,
    max: 3,
    impl: (a) => {
      const target = scalar(a[0]);
      if (isError(target)) return target;
      const m = matrix(a[1]);
      const list = m.length === 1 ? m[0] : m.map((r) => r[0]);
      const type = a.length > 2 ? num(a[2]) : 1;
      if (isError(type)) return type;
      let i: number;
      if (type === 0) i = exactIndex(list, target, true);
      else if (type > 0) i = approxIndex(list, target);
      else {
        // Orden descendente: menor valor >= objetivo
        i = -1;
        for (let k = 0; k < list.length; k++) {
          if (compareValues(list[k], target) >= 0) i = k;
          else break;
        }
      }
      return i < 0 ? ERR.na() : i + 1;
    },
  },
  INDEX: {
    min: 2,
    max: 3,
    impl: (a) => {
      const m = matrix(a[0]);
      const r = num(a[1]);
      const c = a.length > 2 && a[2] !== null ? num(a[2]) : null;
      if (isError(r)) return r;
      if (c !== null && isError(c)) return c;
      let row = Math.trunc(r);
      let col = c === null ? 0 : Math.trunc(c);
      if (m.length === 1 && c === null) {
        col = row;
        row = 1;
      } else if (c === null) col = 1;
      if (row === 0 && col > 0) return new RangeValue(m.map((x) => [x[col - 1]]));
      if (col === 0 && row > 0) return new RangeValue([m[row - 1] ?? []]);
      if (row < 1 || col < 1 || row > m.length || col > (m[0]?.length ?? 0)) return ERR.ref();
      return m[row - 1][col - 1];
    },
  },
  LOOKUP: {
    min: 2,
    max: 3,
    impl: (a) => {
      const target = scalar(a[0]);
      if (isError(target)) return target;
      const m = matrix(a[1]);
      const vertical = m.length >= (m[0]?.length ?? 0);
      const list = vertical ? m.map((r) => r[0]) : m[0];
      const i = approxIndex(list, target);
      if (i < 0) return ERR.na();
      if (a.length > 2) {
        const rm = matrix(a[2]);
        const rl = rm.length === 1 ? rm[0] : rm.map((r) => r[0]);
        return rl[i] ?? ERR.na();
      }
      return vertical ? m[i][m[i].length - 1] : m[m.length - 1][i];
    },
  },
  OFFSET: {
    min: 3,
    max: 5,
    impl: (a, ctx, nodes) => {
      ctx.markVolatile();
      const ref = ctx.refOf(nodes[0]);
      if (!ref) return ERR.value();
      const dr = num(a[1]);
      const dc = num(a[2]);
      if (isError(dr)) return dr;
      if (isError(dc)) return dc;
      const h = a.length > 3 && a[3] !== null ? num(a[3]) : ref.r2 - ref.r1 + 1;
      const w = a.length > 4 && a[4] !== null ? num(a[4]) : ref.c2 - ref.c1 + 1;
      if (isError(h)) return h;
      if (isError(w)) return w;
      const r1 = ref.r1 + Math.trunc(dr);
      const c1 = ref.c1 + Math.trunc(dc);
      if (r1 < 0 || c1 < 0 || h < 1 || w < 1) return ERR.ref();
      return ctx.evalRange(ref.sheetId, r1, c1, r1 + Math.trunc(h) - 1, c1 + Math.trunc(w) - 1);
    },
  },
  INDIRECT: {
    min: 1,
    max: 2,
    impl: (a, ctx) => {
      ctx.markVolatile();
      const s = text(a[0]);
      if (isError(s)) return s;
      return ctx.indirect(s);
    },
  },
  FILTER: {
    min: 2,
    max: 3,
    impl: (a) => {
      const data = matrix(a[0]);
      const inc = matrix(a[1]);
      const rows: Value[][] = [];
      data.forEach((row, i) => {
        const v = inc[i]?.[0] ?? inc[0]?.[i];
        if (v === true || (typeof v === 'number' && v !== 0)) rows.push(row);
      });
      if (!rows.length) return a.length > 2 ? a[2] : ERR.value('FILTER sin resultados');
      return new RangeValue(rows);
    },
  },
};

export type { EvalResult };
