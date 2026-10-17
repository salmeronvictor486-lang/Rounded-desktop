import { ERR, RangeValue, compareValues, isError, toBool, toNumber, toText, type EvalResult, type FormulaError, type Value } from '../values';

export function scalar(v: EvalResult): Value {
  return v instanceof RangeValue ? v.topLeft() : v;
}

export function num(v: EvalResult): number | FormulaError {
  return toNumber(scalar(v));
}

export function text(v: EvalResult): string | FormulaError {
  return toText(scalar(v));
}

export function bool(v: EvalResult): boolean | FormulaError {
  return toBool(scalar(v));
}

/** Todos los valores de los argumentos (los rangos se recorren). */
export function* allValues(args: EvalResult[]): Generator<{ v: Value; fromRange: boolean }> {
  for (const a of args) {
    if (a instanceof RangeValue) for (const v of a.values()) yield { v, fromRange: true };
    else yield { v: a, fromRange: false };
  }
}

/**
 * Números para funciones de agregación: en rangos se ignoran texto, booleanos y
 * vacíos; los argumentos directos se convierten. Los errores se propagan.
 */
export function collectNumbers(args: EvalResult[], opts: { includeBoolsInRange?: boolean; textAsZero?: boolean } = {}): number[] | FormulaError {
  const out: number[] = [];
  for (const { v, fromRange } of allValues(args)) {
    if (isError(v)) return v;
    if (fromRange) {
      if (typeof v === 'number') out.push(v);
      else if (typeof v === 'boolean' && opts.includeBoolsInRange) out.push(v ? 1 : 0);
      else if (typeof v === 'string' && opts.textAsZero) out.push(0);
    } else {
      if (v === null) continue;
      const n = toNumber(v);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
}

export function matrix(v: EvalResult): Value[][] {
  return v instanceof RangeValue ? v.rows : [[v]];
}

export function flat(v: EvalResult): Value[] {
  return v instanceof RangeValue ? Array.from(v.values()) : [v];
}

function wildcardToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** Criterio de SUMIF/COUNTIF/...: ">5", "<>a", "a*", 10, TRUE. */
export function makeCriterion(crit: Value): (v: Value) => boolean {
  if (typeof crit === 'number' || typeof crit === 'boolean') {
    return (v) => (typeof crit === 'number' ? (typeof v === 'number' ? v === crit : typeof v === 'string' && v.trim() !== '' && Number(v) === crit) : v === crit);
  }
  if (crit === null) return (v) => v === null || v === '';
  if (isError(crit)) return (v) => isError(v) && v.code === crit.code;
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(crit)!;
  const op = m[1] ?? '=';
  const operand = m[2];
  const n = operand.trim() !== '' && Number.isFinite(Number(operand)) ? Number(operand) : null;
  if (n !== null) {
    return (v) => {
      if (typeof v !== 'number') return op === '<>' ? true : false;
      switch (op) {
        case '=':
          return v === n;
        case '<>':
          return v !== n;
        case '<':
          return v < n;
        case '>':
          return v > n;
        case '<=':
          return v <= n;
        case '>=':
          return v >= n;
      }
      return false;
    };
  }
  if (op === '=' || op === '<>') {
    if (operand === '') return op === '=' ? (v) => v === null || v === '' : (v) => !(v === null || v === '');
    const re = wildcardToRegex(operand);
    const test = (v: Value) => v !== null && !isError(v) && re.test(String(toText(v)));
    return op === '=' ? test : (v) => !test(v);
  }
  return (v) => {
    if (typeof v !== 'string') return false;
    const c = compareValues(v, operand);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  };
}

export function argError(...vals: EvalResult[]): FormulaError | null {
  for (const v of vals) {
    const s = scalar(v);
    if (isError(s)) return s;
  }
  return null;
}

export { ERR };
