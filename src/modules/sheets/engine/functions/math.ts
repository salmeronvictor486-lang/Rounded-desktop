import { ERR, RangeValue, isError, type EvalResult, type Value } from '../values';
import { allValues, collectNumbers, makeCriterion, matrix, num, scalar } from './util';
import type { FnTable } from './types';

const n1 = (f: (x: number) => number, check?: (x: number) => boolean) => ({
  min: 1,
  max: 1,
  impl: (a: EvalResult[]) => {
    const x = num(a[0]);
    if (isError(x)) return x;
    if (check && !check(x)) return ERR.num();
    const r = f(x);
    return Number.isFinite(r) ? r : ERR.num();
  },
});

function roundTo(x: number, digits: number, mode: 'round' | 'up' | 'down'): number {
  const f = 10 ** digits;
  const v = x * f;
  // Corrección de errores de coma flotante (2.675 → 2.68)
  const eps = Math.sign(v) * 1e-9 * Math.max(1, Math.abs(v));
  let r: number;
  if (mode === 'round') r = Math.sign(v) * Math.round(Math.abs(v) + Math.abs(eps));
  else if (mode === 'up') r = Math.sign(v) * Math.ceil(Math.abs(v) - Math.abs(eps));
  else r = Math.sign(v) * Math.floor(Math.abs(v) + Math.abs(eps));
  return r / f;
}

const roundFn = (mode: 'round' | 'up' | 'down') => ({
  min: 1,
  max: 2,
  impl: (a: EvalResult[]) => {
    const x = num(a[0]);
    const d = a.length > 1 ? num(a[1]) : 0;
    if (isError(x)) return x;
    if (isError(d)) return d;
    return roundTo(x, Math.trunc(d), mode);
  },
});

function sumIfs(sumRange: EvalResult | null, pairs: [EvalResult, Value][]): number | ReturnType<typeof ERR.value> {
  const crits = pairs.map(([r, c]) => ({ rows: matrix(r), test: makeCriterion(c) }));
  const base = crits[0].rows;
  for (const c of crits) if (c.rows.length !== base.length || (c.rows[0]?.length ?? 0) !== (base[0]?.length ?? 0)) return ERR.value('Los rangos deben tener el mismo tamaño');
  const sumRows = sumRange ? matrix(sumRange) : base;
  let total = 0;
  for (let r = 0; r < base.length; r++) {
    for (let c = 0; c < (base[r]?.length ?? 0); c++) {
      if (crits.every((k) => k.test(k.rows[r][c]))) {
        const v = sumRows[r]?.[c];
        if (typeof v === 'number') total += v;
      }
    }
  }
  return total;
}

export const MATH: FnTable = {
  SUM: {
    min: 0,
    impl: (a) => {
      const ns = collectNumbers(a);
      return isError(ns) ? ns : ns.reduce((s, x) => s + x, 0);
    },
  },
  PRODUCT: {
    min: 1,
    impl: (a) => {
      const ns = collectNumbers(a);
      return isError(ns) ? ns : ns.reduce((s, x) => s * x, 1);
    },
  },
  SUMSQ: {
    min: 1,
    impl: (a) => {
      const ns = collectNumbers(a);
      return isError(ns) ? ns : ns.reduce((s, x) => s + x * x, 0);
    },
  },
  ABS: n1(Math.abs),
  SQRT: n1(Math.sqrt, (x) => x >= 0),
  EXP: n1(Math.exp),
  LN: n1(Math.log, (x) => x > 0),
  LOG10: n1(Math.log10, (x) => x > 0),
  LOG: {
    min: 1,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const b = a.length > 1 ? num(a[1]) : 10;
      if (isError(x)) return x;
      if (isError(b)) return b;
      if (x <= 0 || b <= 0 || b === 1) return ERR.num();
      return Math.log(x) / Math.log(b);
    },
  },
  SIN: n1(Math.sin),
  COS: n1(Math.cos),
  TAN: n1(Math.tan),
  ASIN: n1(Math.asin, (x) => x >= -1 && x <= 1),
  ACOS: n1(Math.acos, (x) => x >= -1 && x <= 1),
  ATAN: n1(Math.atan),
  ATAN2: {
    min: 2,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const y = num(a[1]);
      if (isError(x)) return x;
      if (isError(y)) return y;
      if (x === 0 && y === 0) return ERR.div0();
      return Math.atan2(y, x);
    },
  },
  RADIANS: n1((x) => (x * Math.PI) / 180),
  DEGREES: n1((x) => (x * 180) / Math.PI),
  PI: { min: 0, max: 0, impl: () => Math.PI },
  INT: n1(Math.floor),
  TRUNC: roundFn('down'),
  SIGN: n1(Math.sign),
  EVEN: n1((x) => {
    const r = Math.ceil(Math.abs(x) / 2) * 2;
    return x < 0 ? -r : r;
  }),
  ODD: n1((x) => {
    let r = Math.ceil(Math.abs(x));
    if (r % 2 === 0) r += 1;
    return x < 0 ? -r : r;
  }),
  FACT: n1((x) => {
    let r = 1;
    for (let i = 2; i <= Math.floor(x); i++) r *= i;
    return r;
  }, (x) => x >= 0 && x < 171),
  ROUND: roundFn('round'),
  ROUNDUP: roundFn('up'),
  ROUNDDOWN: roundFn('down'),
  MROUND: {
    min: 2,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const m = num(a[1]);
      if (isError(x)) return x;
      if (isError(m)) return m;
      if (m === 0) return 0;
      if (Math.sign(x) * Math.sign(m) < 0) return ERR.num();
      return Math.round(x / m) * m;
    },
  },
  CEILING: {
    min: 1,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const s = a.length > 1 ? num(a[1]) : 1;
      if (isError(x)) return x;
      if (isError(s)) return s;
      if (s === 0) return 0;
      return Math.ceil(x / s - 1e-12) * s;
    },
  },
  FLOOR: {
    min: 1,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const s = a.length > 1 ? num(a[1]) : 1;
      if (isError(x)) return x;
      if (isError(s)) return s;
      if (s === 0) return ERR.div0();
      return Math.floor(x / s + 1e-12) * s;
    },
  },
  MOD: {
    min: 2,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const d = num(a[1]);
      if (isError(x)) return x;
      if (isError(d)) return d;
      if (d === 0) return ERR.div0();
      return x - d * Math.floor(x / d);
    },
  },
  QUOTIENT: {
    min: 2,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const d = num(a[1]);
      if (isError(x)) return x;
      if (isError(d)) return d;
      if (d === 0) return ERR.div0();
      return Math.trunc(x / d);
    },
  },
  POWER: {
    min: 2,
    max: 2,
    impl: (a) => {
      const x = num(a[0]);
      const y = num(a[1]);
      if (isError(x)) return x;
      if (isError(y)) return y;
      const r = Math.pow(x, y);
      return Number.isFinite(r) ? r : ERR.num();
    },
  },
  GCD: {
    min: 1,
    impl: (a) => {
      const ns = collectNumbers(a);
      if (isError(ns)) return ns;
      const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
      return ns.map((x) => Math.trunc(Math.abs(x))).reduce((acc, x) => g(acc, x), 0);
    },
  },
  LCM: {
    min: 1,
    impl: (a) => {
      const ns = collectNumbers(a);
      if (isError(ns)) return ns;
      const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
      return ns.map((x) => Math.trunc(Math.abs(x))).reduce((acc, x) => (acc === 0 || x === 0 ? 0 : (acc * x) / g(acc, x)), 1);
    },
  },
  RAND: {
    min: 0,
    max: 0,
    impl: (_a, ctx) => {
      ctx.markVolatile();
      return Math.random();
    },
  },
  RANDBETWEEN: {
    min: 2,
    max: 2,
    impl: (a, ctx) => {
      ctx.markVolatile();
      const lo = num(a[0]);
      const hi = num(a[1]);
      if (isError(lo)) return lo;
      if (isError(hi)) return hi;
      if (lo > hi) return ERR.num();
      return Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) + Math.ceil(lo);
    },
  },
  SUMIF: {
    min: 2,
    max: 3,
    impl: (a) => sumIfs(a.length > 2 ? a[2] : null, [[a[0], scalar(a[1])]]),
  },
  SUMIFS: {
    min: 3,
    impl: (a) => {
      if ((a.length - 1) % 2 !== 0) return ERR.value('Número de argumentos incorrecto');
      const pairs: [EvalResult, Value][] = [];
      for (let i = 1; i < a.length; i += 2) pairs.push([a[i], scalar(a[i + 1])]);
      return sumIfs(a[0], pairs);
    },
  },
  SUMPRODUCT: {
    min: 1,
    impl: (a) => {
      const ms = a.map(matrix);
      const h = ms[0].length;
      const w = ms[0][0]?.length ?? 0;
      if (ms.some((m) => m.length !== h || (m[0]?.length ?? 0) !== w)) return ERR.value('Las matrices deben tener el mismo tamaño');
      let total = 0;
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          let p = 1;
          for (const m of ms) {
            const v = m[r][c];
            if (isError(v)) return v;
            p *= typeof v === 'number' ? v : 0;
          }
          total += p;
        }
      return total;
    },
  },
  SUBTOTAL: {
    min: 2,
    impl: (a, ctx, nodes) => {
      const code = num(a[0]);
      if (isError(code)) return code;
      const fnMap: Record<number, string> = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP' };
      const name = fnMap[Math.trunc(code) % 100];
      if (!name) return ERR.value();
      const def = SUBTOTAL_TARGETS[name];
      return def.impl(a.slice(1), ctx, nodes.slice(1));
    },
  },
  TRANSPOSE: {
    min: 1,
    max: 1,
    impl: (a) => {
      const m = matrix(a[0]);
      const out: Value[][] = [];
      for (let c = 0; c < (m[0]?.length ?? 0); c++) out.push(m.map((row) => row[c]));
      return new RangeValue(out);
    },
  },
  SEQUENCE: {
    min: 1,
    max: 4,
    impl: (a) => {
      const rows = num(a[0]);
      const cols = a.length > 1 && a[1] !== null ? num(a[1]) : 1;
      const start = a.length > 2 && a[2] !== null ? num(a[2]) : 1;
      const step = a.length > 3 && a[3] !== null ? num(a[3]) : 1;
      for (const x of [rows, cols, start, step]) if (isError(x)) return x;
      if ((rows as number) * (cols as number) > 100000) return ERR.num();
      const out: Value[][] = [];
      let v = start as number;
      for (let r = 0; r < (rows as number); r++) {
        const row: Value[] = [];
        for (let c = 0; c < (cols as number); c++) {
          row.push(v);
          v += step as number;
        }
        out.push(row);
      }
      return new RangeValue(out);
    },
  },
};

// Se rellena en index.ts para evitar dependencias circulares.
export const SUBTOTAL_TARGETS: FnTable = {};

export { allValues };
