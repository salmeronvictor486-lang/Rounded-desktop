import { ERR, isError, type EvalResult } from '../values';
import { dateToSerial, jsDateToSerial, serialToParts } from '../dates';
import { parseDateTimeText } from '../../format/parseInput';
import { allValues, num, scalar, text } from './util';
import type { FnTable } from './types';

const part = (k: 'y' | 'm' | 'd' | 'h' | 'mi' | 's') => ({
  min: 1,
  max: 1,
  impl: (a: EvalResult[]) => {
    const v = scalar(a[0]);
    let n: number | ReturnType<typeof ERR.value>;
    if (typeof v === 'string') {
      const p = parseDateTimeText(v);
      n = p ? p.serial : ERR.value();
    } else n = num(a[0]);
    if (isError(n)) return n;
    if (n < 0) return ERR.num();
    return serialToParts(n)[k];
  },
});

function holidaysOf(a: EvalResult | undefined): Set<number> {
  const s = new Set<number>();
  if (!a) return s;
  for (const { v } of allValues([a])) if (typeof v === 'number') s.add(Math.floor(v));
  return s;
}

const isWeekend = (serial: number) => {
  const dow = serialToParts(serial).dow;
  return dow === 0 || dow === 6;
};

export const DATETIME: FnTable = {
  TODAY: {
    min: 0,
    max: 0,
    impl: (_a, ctx) => {
      ctx.markVolatile();
      return Math.floor(jsDateToSerial(ctx.now));
    },
  },
  NOW: {
    min: 0,
    max: 0,
    impl: (_a, ctx) => {
      ctx.markVolatile();
      return jsDateToSerial(ctx.now);
    },
  },
  DATE: {
    min: 3,
    max: 3,
    impl: (a) => {
      const y = num(a[0]);
      const m = num(a[1]);
      const d = num(a[2]);
      if (isError(y)) return y;
      if (isError(m)) return m;
      if (isError(d)) return d;
      const yy = y < 1900 ? y + 1900 : y;
      const s = dateToSerial(Math.trunc(yy), Math.trunc(m), Math.trunc(d));
      return s < 0 ? ERR.num() : s;
    },
  },
  TIME: {
    min: 3,
    max: 3,
    impl: (a) => {
      const h = num(a[0]);
      const m = num(a[1]);
      const s = num(a[2]);
      if (isError(h)) return h;
      if (isError(m)) return m;
      if (isError(s)) return s;
      const total = (h * 3600 + m * 60 + s) / 86400;
      return total - Math.floor(total);
    },
  },
  YEAR: part('y'),
  MONTH: part('m'),
  DAY: part('d'),
  HOUR: part('h'),
  MINUTE: part('mi'),
  SECOND: part('s'),
  WEEKDAY: {
    min: 1,
    max: 2,
    impl: (a) => {
      const n = num(a[0]);
      const type = a.length > 1 ? num(a[1]) : 1;
      if (isError(n)) return n;
      if (isError(type)) return type;
      const dow = serialToParts(n).dow;
      if (type === 2) return dow === 0 ? 7 : dow;
      if (type === 3) return dow === 0 ? 6 : dow - 1;
      return dow + 1;
    },
  },
  WEEKNUM: {
    min: 1,
    max: 2,
    impl: (a) => {
      const n = num(a[0]);
      const type = a.length > 1 ? num(a[1]) : 1;
      if (isError(n)) return n;
      if (isError(type)) return type;
      const p = serialToParts(n);
      if (type === 21) {
        // ISO 8601
        const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      }
      const jan1 = dateToSerial(p.y, 1, 1);
      const startDow = serialToParts(jan1).dow;
      const offset = type === 2 ? (startDow + 6) % 7 : startDow;
      return Math.floor((Math.floor(n) - jan1 + offset) / 7) + 1;
    },
  },
  ISOWEEKNUM: {
    min: 1,
    max: 1,
    impl: (a, ctx, nodes) => DATETIME.WEEKNUM.impl([a[0], 21], ctx, nodes),
  },
  EDATE: {
    min: 2,
    max: 2,
    impl: (a) => {
      const n = num(a[0]);
      const m = num(a[1]);
      if (isError(n)) return n;
      if (isError(m)) return m;
      const p = serialToParts(n);
      const target = new Date(Date.UTC(p.y, p.m - 1 + Math.trunc(m), 1));
      const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      return dateToSerial(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(p.d, lastDay));
    },
  },
  EOMONTH: {
    min: 2,
    max: 2,
    impl: (a) => {
      const n = num(a[0]);
      const m = num(a[1]);
      if (isError(n)) return n;
      if (isError(m)) return m;
      const p = serialToParts(n);
      const d = new Date(Date.UTC(p.y, p.m + Math.trunc(m), 0));
      return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    },
  },
  DAYS: {
    min: 2,
    max: 2,
    impl: (a) => {
      const e = num(a[0]);
      const s = num(a[1]);
      if (isError(e)) return e;
      if (isError(s)) return s;
      return Math.floor(e) - Math.floor(s);
    },
  },
  DATEDIF: {
    min: 3,
    max: 3,
    impl: (a) => {
      const s = num(a[0]);
      const e = num(a[1]);
      const unit = text(a[2]);
      if (isError(s)) return s;
      if (isError(e)) return e;
      if (isError(unit)) return unit;
      if (e < s) return ERR.num();
      const ps = serialToParts(s);
      const pe = serialToParts(e);
      let months = (pe.y - ps.y) * 12 + (pe.m - ps.m);
      if (pe.d < ps.d) months--;
      switch (unit.toUpperCase()) {
        case 'D':
          return Math.floor(e) - Math.floor(s);
        case 'M':
          return months;
        case 'Y':
          return Math.floor(months / 12);
        case 'YM':
          return months % 12;
        case 'MD': {
          let d = pe.d - ps.d;
          if (d < 0) d += new Date(Date.UTC(pe.y, pe.m - 1, 0)).getUTCDate();
          return d;
        }
        case 'YD': {
          const anniversary = dateToSerial(pe.y, ps.m, ps.d);
          return anniversary <= e ? Math.floor(e - anniversary) : Math.floor(e - dateToSerial(pe.y - 1, ps.m, ps.d));
        }
        default:
          return ERR.num();
      }
    },
  },
  NETWORKDAYS: {
    min: 2,
    max: 3,
    impl: (a) => {
      const s = num(a[0]);
      const e = num(a[1]);
      if (isError(s)) return s;
      if (isError(e)) return e;
      const hol = holidaysOf(a[2]);
      const [lo, hi] = s <= e ? [Math.floor(s), Math.floor(e)] : [Math.floor(e), Math.floor(s)];
      if (hi - lo > 366 * 200) return ERR.num();
      let n = 0;
      for (let d = lo; d <= hi; d++) if (!isWeekend(d) && !hol.has(d)) n++;
      return s <= e ? n : -n;
    },
  },
  WORKDAY: {
    min: 2,
    max: 3,
    impl: (a) => {
      const s = num(a[0]);
      const days = num(a[1]);
      if (isError(s)) return s;
      if (isError(days)) return days;
      const hol = holidaysOf(a[2]);
      let d = Math.floor(s);
      let left = Math.trunc(days);
      const step = left >= 0 ? 1 : -1;
      if (Math.abs(left) > 100000) return ERR.num();
      while (left !== 0) {
        d += step;
        if (!isWeekend(d) && !hol.has(d)) left -= step;
      }
      return d;
    },
  },
  DATEVALUE: {
    min: 1,
    max: 1,
    impl: (a) => {
      const s = text(a[0]);
      if (isError(s)) return s;
      const p = parseDateTimeText(s);
      return p ? Math.floor(p.serial) : ERR.value();
    },
  },
  TIMEVALUE: {
    min: 1,
    max: 1,
    impl: (a) => {
      const s = text(a[0]);
      if (isError(s)) return s;
      const p = parseDateTimeText(s);
      return p ? p.serial - Math.floor(p.serial) : ERR.value();
    },
  },
};
