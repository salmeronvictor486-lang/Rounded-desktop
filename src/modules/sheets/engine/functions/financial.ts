import { ERR, isError, type EvalResult } from '../values';
import { collectNumbers, num } from './util';
import type { FnTable } from './types';

function nums(a: EvalResult[], from: number, defaults: number[]): number[] | ReturnType<typeof ERR.value> {
  const out: number[] = [];
  for (let i = 0; i < defaults.length; i++) {
    if (from + i < a.length && a[from + i] !== null) {
      const n = num(a[from + i]);
      if (isError(n)) return n;
      out.push(n);
    } else out.push(defaults[i]);
  }
  return out;
}

export const FINANCIAL: FnTable = {
  PMT: {
    min: 3,
    max: 5,
    impl: (a) => {
      const v = nums(a, 0, [NaN, NaN, NaN, 0, 0]);
      if (isError(v)) return v;
      const [rate, nper, pv, fv, type] = v;
      if (rate === 0) return -(pv + fv) / nper;
      const f = Math.pow(1 + rate, nper);
      return (-(pv * f + fv) * rate) / ((1 + rate * type) * (f - 1));
    },
  },
  FV: {
    min: 3,
    max: 5,
    impl: (a) => {
      const v = nums(a, 0, [NaN, NaN, NaN, 0, 0]);
      if (isError(v)) return v;
      const [rate, nper, pmt, pv, type] = v;
      if (rate === 0) return -(pv + pmt * nper);
      const f = Math.pow(1 + rate, nper);
      return -(pv * f + (pmt * (1 + rate * type) * (f - 1)) / rate);
    },
  },
  PV: {
    min: 3,
    max: 5,
    impl: (a) => {
      const v = nums(a, 0, [NaN, NaN, NaN, 0, 0]);
      if (isError(v)) return v;
      const [rate, nper, pmt, fv, type] = v;
      if (rate === 0) return -(fv + pmt * nper);
      const f = Math.pow(1 + rate, nper);
      return -(fv + (pmt * (1 + rate * type) * (f - 1)) / rate) / f;
    },
  },
  NPER: {
    min: 3,
    max: 5,
    impl: (a) => {
      const v = nums(a, 0, [NaN, NaN, NaN, 0, 0]);
      if (isError(v)) return v;
      const [rate, pmt, pv, fv, type] = v;
      if (rate === 0) return pmt === 0 ? ERR.num() : -(pv + fv) / pmt;
      const z = pmt * (1 + rate * type);
      const r = Math.log((z - fv * rate) / (z + pv * rate)) / Math.log(1 + rate);
      return Number.isFinite(r) ? r : ERR.num();
    },
  },
  RATE: {
    min: 3,
    max: 6,
    impl: (a) => {
      const v = nums(a, 0, [NaN, NaN, NaN, 0, 0, 0.1]);
      if (isError(v)) return v;
      const [nper, pmt, pv, fv, type, guess] = v;
      let rate = guess;
      for (let i = 0; i < 100; i++) {
        const f = Math.pow(1 + rate, nper);
        const y = pv * f + pmt * (1 + rate * type) * ((f - 1) / rate) + fv;
        const dy = nper * pv * Math.pow(1 + rate, nper - 1) + pmt * (1 + rate * type) * ((nper * Math.pow(1 + rate, nper - 1)) / rate - (f - 1) / (rate * rate)) + pmt * type * ((f - 1) / rate);
        const next = rate - y / dy;
        if (!Number.isFinite(next)) return ERR.num();
        if (Math.abs(next - rate) < 1e-10) return next;
        rate = next;
      }
      return ERR.num('RATE no converge');
    },
  },
  NPV: {
    min: 2,
    impl: (a) => {
      const rate = num(a[0]);
      if (isError(rate)) return rate;
      const ns = collectNumbers(a.slice(1));
      if (isError(ns)) return ns;
      return ns.reduce((s, x, i) => s + x / Math.pow(1 + rate, i + 1), 0);
    },
  },
  IRR: {
    min: 1,
    max: 2,
    impl: (a) => {
      const ns = collectNumbers([a[0]]);
      if (isError(ns)) return ns;
      let rate = a.length > 1 ? Number(num(a[1])) || 0.1 : 0.1;
      for (let i = 0; i < 200; i++) {
        let f = 0;
        let df = 0;
        ns.forEach((x, t) => {
          f += x / Math.pow(1 + rate, t);
          df -= (t * x) / Math.pow(1 + rate, t + 1);
        });
        const next = rate - f / df;
        if (!Number.isFinite(next)) return ERR.num();
        if (Math.abs(next - rate) < 1e-10) return next;
        rate = next;
      }
      return ERR.num('IRR no converge');
    },
  },
};
