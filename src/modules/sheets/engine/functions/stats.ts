import { ERR, RangeValue, compareValues, isError, type EvalResult, type Value } from '../values';
import { allValues, collectNumbers, makeCriterion, matrix, num, scalar } from './util';
import type { FnTable } from './types';

const agg = (f: (ns: number[]) => Value, opts: { includeBoolsInRange?: boolean; textAsZero?: boolean } = {}) => ({
  min: 1,
  impl: (a: EvalResult[]) => {
    const ns = collectNumbers(a, opts);
    return isError(ns) ? ns : f(ns);
  },
});

const mean = (ns: number[]) => ns.reduce((s, x) => s + x, 0) / ns.length;
function variance(ns: number[], sample: boolean): number | null {
  if (ns.length < (sample ? 2 : 1)) return null;
  const m = mean(ns);
  return ns.reduce((s, x) => s + (x - m) ** 2, 0) / (ns.length - (sample ? 1 : 0));
}

function avgIfs(avgRange: EvalResult | null, pairs: [EvalResult, Value][]): Value {
  const crits = pairs.map(([r, c]) => ({ rows: matrix(r), test: makeCriterion(c) }));
  const base = crits[0].rows;
  const vals = avgRange ? matrix(avgRange) : base;
  let total = 0;
  let count = 0;
  for (let r = 0; r < base.length; r++)
    for (let c = 0; c < (base[r]?.length ?? 0); c++) {
      if (crits.every((k) => k.test(k.rows[r]?.[c] ?? null))) {
        const v = vals[r]?.[c];
        if (typeof v === 'number') {
          total += v;
          count++;
        }
      }
    }
  return count ? total / count : ERR.div0();
}

function countIfs(pairs: [EvalResult, Value][]): Value {
  const crits = pairs.map(([r, c]) => ({ rows: matrix(r), test: makeCriterion(c) }));
  const base = crits[0].rows;
  let count = 0;
  for (let r = 0; r < base.length; r++)
    for (let c = 0; c < (base[r]?.length ?? 0); c++) if (crits.every((k) => k.test(k.rows[r]?.[c] ?? null))) count++;
  return count;
}

const kth = (largest: boolean) => ({
  min: 2,
  max: 2,
  impl: (a: EvalResult[]) => {
    const ns = collectNumbers([a[0]]);
    const k = num(a[1]);
    if (isError(ns)) return ns;
    if (isError(k)) return k;
    const sorted = [...ns].sort((x, y) => (largest ? y - x : x - y));
    const i = Math.ceil(k) - 1;
    return i >= 0 && i < sorted.length ? sorted[i] : ERR.num();
  },
});

export const STATS: FnTable = {
  AVERAGE: agg((ns) => (ns.length ? mean(ns) : ERR.div0())),
  AVERAGEA: agg((ns) => (ns.length ? mean(ns) : ERR.div0()), { includeBoolsInRange: true, textAsZero: true }),
  MIN: agg((ns) => (ns.length ? Math.min(...ns) : 0)),
  MAX: agg((ns) => (ns.length ? Math.max(...ns) : 0)),
  MINA: agg((ns) => (ns.length ? Math.min(...ns) : 0), { includeBoolsInRange: true, textAsZero: true }),
  MAXA: agg((ns) => (ns.length ? Math.max(...ns) : 0), { includeBoolsInRange: true, textAsZero: true }),
  MEDIAN: agg((ns) => {
    if (!ns.length) return ERR.num();
    const s = [...ns].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }),
  MODE: agg((ns) => {
    const counts = new Map<number, number>();
    let best: number | null = null;
    let bestN = 1;
    for (const x of ns) {
      const c = (counts.get(x) ?? 0) + 1;
      counts.set(x, c);
      if (c > bestN) {
        bestN = c;
        best = x;
      }
    }
    return best ?? ERR.na();
  }),
  STDEV: agg((ns) => {
    const v = variance(ns, true);
    return v === null ? ERR.div0() : Math.sqrt(v);
  }),
  STDEVP: agg((ns) => {
    const v = variance(ns, false);
    return v === null ? ERR.div0() : Math.sqrt(v);
  }),
  VAR: agg((ns) => variance(ns, true) ?? ERR.div0()),
  VARP: agg((ns) => variance(ns, false) ?? ERR.div0()),
  COUNT: {
    min: 1,
    impl: (a) => {
      let n = 0;
      for (const { v, fromRange } of allValues(a)) {
        if (typeof v === 'number') n++;
        else if (!fromRange && (typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))))) n++;
      }
      return n;
    },
  },
  COUNTA: {
    min: 1,
    impl: (a) => {
      let n = 0;
      for (const { v } of allValues(a)) if (v !== null && v !== '') n++;
      return n;
    },
  },
  COUNTBLANK: {
    min: 1,
    max: 1,
    impl: (a) => {
      let n = 0;
      for (const { v } of allValues(a)) if (v === null || v === '') n++;
      return n;
    },
  },
  COUNTIF: { min: 2, max: 2, impl: (a) => countIfs([[a[0], scalar(a[1])]]) },
  COUNTIFS: {
    min: 2,
    impl: (a) => {
      if (a.length % 2 !== 0) return ERR.value();
      const pairs: [EvalResult, Value][] = [];
      for (let i = 0; i < a.length; i += 2) pairs.push([a[i], scalar(a[i + 1])]);
      return countIfs(pairs);
    },
  },
  AVERAGEIF: { min: 2, max: 3, impl: (a) => avgIfs(a.length > 2 ? a[2] : null, [[a[0], scalar(a[1])]]) },
  AVERAGEIFS: {
    min: 3,
    impl: (a) => {
      if ((a.length - 1) % 2 !== 0) return ERR.value();
      const pairs: [EvalResult, Value][] = [];
      for (let i = 1; i < a.length; i += 2) pairs.push([a[i], scalar(a[i + 1])]);
      return avgIfs(a[0], pairs);
    },
  },
  MAXIFS: {
    min: 3,
    impl: (a) => {
      const vals = matrix(a[0]);
      const crits: { rows: Value[][]; test: (v: Value) => boolean }[] = [];
      for (let i = 1; i + 1 < a.length; i += 2) crits.push({ rows: matrix(a[i]), test: makeCriterion(scalar(a[i + 1])) });
      let best: number | null = null;
      vals.forEach((row, r) => row.forEach((v, c) => {
        if (typeof v === 'number' && crits.every((k) => k.test(k.rows[r]?.[c] ?? null))) best = best === null ? v : Math.max(best, v);
      }));
      return best ?? 0;
    },
  },
  MINIFS: {
    min: 3,
    impl: (a) => {
      const vals = matrix(a[0]);
      const crits: { rows: Value[][]; test: (v: Value) => boolean }[] = [];
      for (let i = 1; i + 1 < a.length; i += 2) crits.push({ rows: matrix(a[i]), test: makeCriterion(scalar(a[i + 1])) });
      let best: number | null = null;
      vals.forEach((row, r) => row.forEach((v, c) => {
        if (typeof v === 'number' && crits.every((k) => k.test(k.rows[r]?.[c] ?? null))) best = best === null ? v : Math.min(best, v);
      }));
      return best ?? 0;
    },
  },
  LARGE: kth(true),
  SMALL: kth(false),
  RANK: {
    min: 2,
    max: 3,
    impl: (a) => {
      const x = num(a[0]);
      const ns = collectNumbers([a[1]]);
      const asc = a.length > 2 ? num(a[2]) : 0;
      if (isError(x)) return x;
      if (isError(ns)) return ns;
      if (isError(asc)) return asc;
      if (!ns.includes(x)) return ERR.na();
      return 1 + ns.filter((y) => (asc ? y < x : y > x)).length;
    },
  },
  PERCENTILE: {
    min: 2,
    max: 2,
    impl: (a) => {
      const ns = collectNumbers([a[0]]);
      const k = num(a[1]);
      if (isError(ns)) return ns;
      if (isError(k)) return k;
      if (!ns.length || k < 0 || k > 1) return ERR.num();
      const s = [...ns].sort((x, y) => x - y);
      const pos = (s.length - 1) * k;
      const lo = Math.floor(pos);
      return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
    },
  },
  QUARTILE: {
    min: 2,
    max: 2,
    impl: (a, ctx, nodes) => {
      const q = num(a[1]);
      if (isError(q)) return q;
      if (q < 0 || q > 4) return ERR.num();
      return STATS.PERCENTILE.impl([a[0], Math.trunc(q) / 4], ctx, nodes);
    },
  },
  CORREL: {
    min: 2,
    max: 2,
    impl: (a) => {
      const xs = Array.from((a[0] instanceof RangeValue ? a[0].values() : [a[0]]) as Iterable<Value>);
      const ys = Array.from((a[1] instanceof RangeValue ? a[1].values() : [a[1]]) as Iterable<Value>);
      if (xs.length !== ys.length) return ERR.na();
      const px: number[] = [];
      const py: number[] = [];
      xs.forEach((x, i) => {
        if (typeof x === 'number' && typeof ys[i] === 'number') {
          px.push(x);
          py.push(ys[i] as number);
        }
      });
      if (px.length < 2) return ERR.div0();
      const mx = mean(px);
      const my = mean(py);
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < px.length; i++) {
        sxy += (px[i] - mx) * (py[i] - my);
        sxx += (px[i] - mx) ** 2;
        syy += (py[i] - my) ** 2;
      }
      return sxx && syy ? sxy / Math.sqrt(sxx * syy) : ERR.div0();
    },
  },
  UNIQUE: {
    min: 1,
    max: 1,
    impl: (a) => {
      const rows = matrix(a[0]);
      const seen = new Set<string>();
      const out: Value[][] = [];
      for (const r of rows) {
        const key = JSON.stringify(r.map((v) => (typeof v === 'string' ? v.toLowerCase() : v)));
        if (!seen.has(key)) {
          seen.add(key);
          out.push(r);
        }
      }
      return new RangeValue(out);
    },
  },
  SORT: {
    min: 1,
    max: 3,
    impl: (a) => {
      const rows = matrix(a[0]).map((r) => [...r]);
      const idx = a.length > 1 && a[1] !== null ? num(a[1]) : 1;
      const order = a.length > 2 && a[2] !== null ? num(a[2]) : 1;
      if (isError(idx)) return idx;
      if (isError(order)) return order;
      const col = Math.trunc(idx) - 1;
      rows.sort((x, y) => compareValues(x[col] ?? null, y[col] ?? null) * (order < 0 ? -1 : 1));
      return new RangeValue(rows);
    },
  },
};
