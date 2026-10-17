import { ERR, RangeValue, compareValues, isError, type EvalResult, type Value } from '../values';
import { allValues, bool, scalar } from './util';
import type { FnTable } from './types';

function boolsOf(a: EvalResult[]): boolean[] | ReturnType<typeof ERR.value> {
  const out: boolean[] = [];
  for (const { v, fromRange } of allValues(a)) {
    if (isError(v)) return v;
    if (v === null || (fromRange && typeof v === 'string')) continue;
    if (typeof v === 'boolean') out.push(v);
    else if (typeof v === 'number') out.push(v !== 0);
    else {
      const b = bool(v);
      if (isError(b)) return b;
      out.push(b);
    }
  }
  return out;
}

export const LOGIC: FnTable = {
  IF: {
    min: 1,
    max: 3,
    lazy: true,
    impl: (_a, ctx, nodes) => {
      const cond = bool(ctx.evalNode(nodes[0]));
      if (isError(cond)) return cond;
      if (cond) return nodes.length > 1 ? ctx.evalNode(nodes[1]) : true;
      return nodes.length > 2 ? ctx.evalNode(nodes[2]) : false;
    },
  },
  IFS: {
    min: 2,
    lazy: true,
    impl: (_a, ctx, nodes) => {
      for (let i = 0; i + 1 < nodes.length; i += 2) {
        const c = bool(ctx.evalNode(nodes[i]));
        if (isError(c)) return c;
        if (c) return ctx.evalNode(nodes[i + 1]);
      }
      return ERR.na('Ninguna condición se cumple');
    },
  },
  IFERROR: {
    min: 2,
    max: 2,
    lazy: true,
    impl: (_a, ctx, nodes) => {
      const v = ctx.evalNode(nodes[0]);
      return isError(scalar(v)) ? ctx.evalNode(nodes[1]) : v;
    },
  },
  IFNA: {
    min: 2,
    max: 2,
    lazy: true,
    impl: (_a, ctx, nodes) => {
      const v = ctx.evalNode(nodes[0]);
      const s = scalar(v);
      return isError(s) && s.code === '#N/A' ? ctx.evalNode(nodes[1]) : v;
    },
  },
  SWITCH: {
    min: 3,
    lazy: true,
    impl: (_a, ctx, nodes) => {
      const target = scalar(ctx.evalNode(nodes[0]));
      if (isError(target)) return target;
      let i = 1;
      for (; i + 1 < nodes.length; i += 2) {
        const v = scalar(ctx.evalNode(nodes[i]));
        if (compareValues(v, target) === 0 && typeof v === typeof target) return ctx.evalNode(nodes[i + 1]);
      }
      return i < nodes.length ? ctx.evalNode(nodes[i]) : ERR.na();
    },
  },
  CHOOSE: {
    min: 2,
    lazy: true,
    impl: (_a, ctx, nodes) => {
      const idx = scalar(ctx.evalNode(nodes[0]));
      if (isError(idx)) return idx;
      const i = Math.trunc(Number(idx));
      if (!Number.isFinite(i) || i < 1 || i >= nodes.length) return ERR.value();
      return ctx.evalNode(nodes[i]);
    },
  },
  AND: {
    min: 1,
    impl: (a) => {
      const bs = boolsOf(a);
      if (isError(bs)) return bs;
      return bs.length ? bs.every(Boolean) : ERR.value();
    },
  },
  OR: {
    min: 1,
    impl: (a) => {
      const bs = boolsOf(a);
      if (isError(bs)) return bs;
      return bs.length ? bs.some(Boolean) : ERR.value();
    },
  },
  XOR: {
    min: 1,
    impl: (a) => {
      const bs = boolsOf(a);
      if (isError(bs)) return bs;
      return bs.filter(Boolean).length % 2 === 1;
    },
  },
  NOT: {
    min: 1,
    max: 1,
    impl: (a) => {
      const b = bool(a[0]);
      return isError(b) ? b : !b;
    },
  },
  TRUE: { min: 0, max: 0, impl: () => true },
  FALSE: { min: 0, max: 0, impl: () => false },
};

export const INFO: FnTable = {
  ISBLANK: { min: 1, max: 1, impl: (a) => scalar(a[0]) === null },
  ISNUMBER: { min: 1, max: 1, impl: (a) => typeof scalar(a[0]) === 'number' },
  ISTEXT: { min: 1, max: 1, impl: (a) => typeof scalar(a[0]) === 'string' },
  ISNONTEXT: { min: 1, max: 1, impl: (a) => typeof scalar(a[0]) !== 'string' },
  ISLOGICAL: { min: 1, max: 1, impl: (a) => typeof scalar(a[0]) === 'boolean' },
  ISERROR: { min: 1, max: 1, impl: (a) => isError(scalar(a[0])) },
  ISERR: {
    min: 1,
    max: 1,
    impl: (a) => {
      const v = scalar(a[0]);
      return isError(v) && v.code !== '#N/A';
    },
  },
  ISNA: {
    min: 1,
    max: 1,
    impl: (a) => {
      const v = scalar(a[0]);
      return isError(v) && v.code === '#N/A';
    },
  },
  ISEVEN: { min: 1, max: 1, impl: (a) => Math.trunc(Number(scalar(a[0]))) % 2 === 0 },
  ISODD: { min: 1, max: 1, impl: (a) => Math.abs(Math.trunc(Number(scalar(a[0])))) % 2 === 1 },
  NA: { min: 0, max: 0, impl: () => ERR.na() },
  N: {
    min: 1,
    max: 1,
    impl: (a) => {
      const v = scalar(a[0]);
      return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : isError(v) ? v : 0;
    },
  },
  TYPE: {
    min: 1,
    max: 1,
    impl: (a) => {
      if (a[0] instanceof RangeValue) return 64;
      const v = a[0] as Value;
      return typeof v === 'number' || v === null ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : 16;
    },
  },
  ROW: {
    min: 0,
    max: 1,
    impl: (_a, ctx, nodes) => {
      if (!nodes.length) return ctx.cell.row + 1;
      const r = ctx.refOf(nodes[0]);
      return r ? r.r1 + 1 : ERR.value();
    },
  },
  COLUMN: {
    min: 0,
    max: 1,
    impl: (_a, ctx, nodes) => {
      if (!nodes.length) return ctx.cell.col + 1;
      const r = ctx.refOf(nodes[0]);
      return r ? r.c1 + 1 : ERR.value();
    },
  },
  ROWS: { min: 1, max: 1, impl: (a) => (a[0] instanceof RangeValue ? a[0].height : 1) },
  COLUMNS: { min: 1, max: 1, impl: (a) => (a[0] instanceof RangeValue ? a[0].width : 1) },
};
