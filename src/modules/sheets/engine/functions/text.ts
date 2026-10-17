import { ERR, isError, toText, type EvalResult } from '../values';
import { formatValue } from '../../format/numberFormat';
import { allValues, num, scalar, text } from './util';
import type { FnTable } from './types';

const t1 = (f: (s: string) => EvalResult) => ({
  min: 1,
  max: 1,
  impl: (a: EvalResult[]) => {
    const s = text(a[0]);
    return isError(s) ? s : f(s);
  },
});

export const TEXT: FnTable = {
  CONCAT: {
    min: 1,
    impl: (a) => {
      let s = '';
      for (const { v } of allValues(a)) {
        const t = toText(v);
        if (isError(t)) return t;
        s += t;
      }
      return s;
    },
  },
  CONCATENATE: {
    min: 1,
    impl: (a) => {
      let s = '';
      for (const x of a) {
        const t = text(x);
        if (isError(t)) return t;
        s += t;
      }
      return s;
    },
  },
  TEXTJOIN: {
    min: 3,
    impl: (a) => {
      const sep = text(a[0]);
      const ignore = scalar(a[1]);
      if (isError(sep)) return sep;
      const parts: string[] = [];
      for (const { v } of allValues(a.slice(2))) {
        const t = toText(v);
        if (isError(t)) return t;
        if (ignore && t === '') continue;
        parts.push(t);
      }
      return parts.join(sep);
    },
  },
  LEN: t1((s) => s.length),
  UPPER: t1((s) => s.toUpperCase()),
  LOWER: t1((s) => s.toLowerCase()),
  PROPER: t1((s) => s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())),
  TRIM: t1((s) => s.trim().replace(/ {2,}/g, ' ')),
  CLEAN: t1((s) => s.replace(/[\u0000-\u001f]/g, '')),
  LEFT: {
    min: 1,
    max: 2,
    impl: (a) => {
      const s = text(a[0]);
      const n = a.length > 1 ? num(a[1]) : 1;
      if (isError(s)) return s;
      if (isError(n)) return n;
      return n < 0 ? ERR.value() : s.slice(0, Math.trunc(n));
    },
  },
  RIGHT: {
    min: 1,
    max: 2,
    impl: (a) => {
      const s = text(a[0]);
      const n = a.length > 1 ? num(a[1]) : 1;
      if (isError(s)) return s;
      if (isError(n)) return n;
      return n < 0 ? ERR.value() : Math.trunc(n) === 0 ? '' : s.slice(-Math.trunc(n));
    },
  },
  MID: {
    min: 3,
    max: 3,
    impl: (a) => {
      const s = text(a[0]);
      const st = num(a[1]);
      const n = num(a[2]);
      if (isError(s)) return s;
      if (isError(st)) return st;
      if (isError(n)) return n;
      if (st < 1 || n < 0) return ERR.value();
      return s.substr(Math.trunc(st) - 1, Math.trunc(n));
    },
  },
  REPT: {
    min: 2,
    max: 2,
    impl: (a) => {
      const s = text(a[0]);
      const n = num(a[1]);
      if (isError(s)) return s;
      if (isError(n)) return n;
      if (n < 0 || s.length * n > 32767) return ERR.value();
      return s.repeat(Math.trunc(n));
    },
  },
  FIND: {
    min: 2,
    max: 3,
    impl: (a) => {
      const f = text(a[0]);
      const s = text(a[1]);
      const st = a.length > 2 ? num(a[2]) : 1;
      if (isError(f)) return f;
      if (isError(s)) return s;
      if (isError(st)) return st;
      const i = s.indexOf(f, Math.trunc(st) - 1);
      return i < 0 ? ERR.value('Texto no encontrado') : i + 1;
    },
  },
  SEARCH: {
    min: 2,
    max: 3,
    impl: (a) => {
      const f = text(a[0]);
      const s = text(a[1]);
      const st = a.length > 2 ? num(a[2]) : 1;
      if (isError(f)) return f;
      if (isError(s)) return s;
      if (isError(st)) return st;
      const pattern = f.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      const re = new RegExp(pattern, 'i');
      const sub = s.slice(Math.trunc(st) - 1);
      const m = re.exec(sub);
      return m ? m.index + Math.trunc(st) : ERR.value('Texto no encontrado');
    },
  },
  SUBSTITUTE: {
    min: 3,
    max: 4,
    impl: (a) => {
      const s = text(a[0]);
      const o = text(a[1]);
      const nw = text(a[2]);
      if (isError(s)) return s;
      if (isError(o)) return o;
      if (isError(nw)) return nw;
      if (!o) return s;
      if (a.length > 3) {
        const which = num(a[3]);
        if (isError(which)) return which;
        let idx = -1;
        for (let k = 0; k < which; k++) {
          idx = s.indexOf(o, idx + 1);
          if (idx < 0) return s;
        }
        return s.slice(0, idx) + nw + s.slice(idx + o.length);
      }
      return s.split(o).join(nw);
    },
  },
  REPLACE: {
    min: 4,
    max: 4,
    impl: (a) => {
      const s = text(a[0]);
      const st = num(a[1]);
      const n = num(a[2]);
      const nw = text(a[3]);
      if (isError(s)) return s;
      if (isError(st)) return st;
      if (isError(n)) return n;
      if (isError(nw)) return nw;
      return s.slice(0, Math.trunc(st) - 1) + nw + s.slice(Math.trunc(st) - 1 + Math.trunc(n));
    },
  },
  EXACT: {
    min: 2,
    max: 2,
    impl: (a) => {
      const x = text(a[0]);
      const y = text(a[1]);
      if (isError(x)) return x;
      if (isError(y)) return y;
      return x === y;
    },
  },
  CHAR: {
    min: 1,
    max: 1,
    impl: (a) => {
      const n = num(a[0]);
      if (isError(n)) return n;
      return n < 1 || n > 65535 ? ERR.value() : String.fromCharCode(Math.trunc(n));
    },
  },
  CODE: t1((s) => (s ? s.charCodeAt(0) : ERR.value())),
  UNICHAR: {
    min: 1,
    max: 1,
    impl: (a) => {
      const n = num(a[0]);
      if (isError(n)) return n;
      try {
        return String.fromCodePoint(Math.trunc(n));
      } catch {
        return ERR.value();
      }
    },
  },
  T: {
    min: 1,
    max: 1,
    impl: (a) => {
      const v = scalar(a[0]);
      return typeof v === 'string' ? v : isError(v) ? v : '';
    },
  },
  VALUE: t1((s) => {
    const n = Number(s.trim().replace(/,/g, ''));
    if (Number.isFinite(n) && s.trim() !== '') return n;
    const pct = /^(-?[\d.]+)\s*%$/.exec(s.trim());
    return pct ? Number(pct[1]) / 100 : ERR.value(`«${s}» no es un número`);
  }),
  TEXT: {
    min: 2,
    max: 2,
    impl: (a) => {
      const v = scalar(a[0]);
      const fmt = text(a[1]);
      if (isError(v)) return v;
      if (isError(fmt)) return fmt;
      return formatValue(v, fmt).text;
    },
  },
  FIXED: {
    min: 1,
    max: 3,
    impl: (a) => {
      const n = num(a[0]);
      const d = a.length > 1 ? num(a[1]) : 2;
      const noCommas = a.length > 2 ? scalar(a[2]) : false;
      if (isError(n)) return n;
      if (isError(d)) return d;
      const dd = Math.max(0, Math.trunc(d));
      return n.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd, useGrouping: !noCommas });
    },
  },
  TEXTBEFORE: {
    min: 2,
    max: 2,
    impl: (a) => {
      const s = text(a[0]);
      const d = text(a[1]);
      if (isError(s)) return s;
      if (isError(d)) return d;
      const i = s.indexOf(d);
      return i < 0 ? ERR.na() : s.slice(0, i);
    },
  },
  TEXTAFTER: {
    min: 2,
    max: 2,
    impl: (a) => {
      const s = text(a[0]);
      const d = text(a[1]);
      if (isError(s)) return s;
      if (isError(d)) return d;
      const i = s.indexOf(d);
      return i < 0 ? ERR.na() : s.slice(i + d.length);
    },
  },
};
