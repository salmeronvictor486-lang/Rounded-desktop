export type ErrorCode = '#DIV/0!' | '#N/A' | '#NAME?' | '#NULL!' | '#NUM!' | '#REF!' | '#VALUE!' | '#CIRC!' | '#SPILL!';

export class FormulaError {
  constructor(
    readonly code: ErrorCode,
    readonly message?: string,
  ) {}
  toString() {
    return this.code;
  }
}

export const ERR = {
  div0: () => new FormulaError('#DIV/0!', 'División por cero'),
  na: (m?: string) => new FormulaError('#N/A', m ?? 'Valor no disponible'),
  name: (m?: string) => new FormulaError('#NAME?', m ?? 'Nombre o función desconocida'),
  num: (m?: string) => new FormulaError('#NUM!', m ?? 'Número no válido'),
  ref: (m?: string) => new FormulaError('#REF!', m ?? 'Referencia no válida'),
  value: (m?: string) => new FormulaError('#VALUE!', m ?? 'Tipo de valor incorrecto'),
  circ: () => new FormulaError('#CIRC!', 'Referencia circular'),
};

export type Value = number | string | boolean | null | FormulaError;

/** Matriz de valores (resultado de evaluar un rango o una matriz literal). */
export class RangeValue {
  constructor(readonly rows: Value[][]) {}
  get height() {
    return this.rows.length;
  }
  get width() {
    return this.rows[0]?.length ?? 0;
  }
  *values(): Generator<Value> {
    for (const r of this.rows) for (const v of r) yield v;
  }
  topLeft(): Value {
    return this.rows[0]?.[0] ?? null;
  }
}

export type EvalResult = Value | RangeValue;

export const isError = (v: unknown): v is FormulaError => v instanceof FormulaError;

const ERROR_CODES = new Set(['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!', '#CIRC!', '#SPILL!']);
export function parseErrorCode(s: string): FormulaError | null {
  const u = s.toUpperCase();
  return ERROR_CODES.has(u) ? new FormulaError(u as ErrorCode) : null;
}

/** Conversión a número según las reglas de las hojas de cálculo. */
export function toNumber(v: Value): number | FormulaError {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isError(v)) return v;
  const s = v.trim();
  if (s === '') return 0;
  const pct = /^(-?[\d.]+(?:e[+-]?\d+)?)\s*%$/i.exec(s);
  if (pct) return Number(pct[1]) / 100;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : ERR.value(`«${s}» no es un número`);
}

export function toText(v: Value): string | FormulaError {
  if (v === null) return '';
  if (isError(v)) return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return formatGeneralNumber(v);
  return v;
}

export function toBool(v: Value): boolean | FormulaError {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isError(v)) return v;
  const u = v.toUpperCase();
  if (u === 'TRUE' || u === 'VERDADERO') return true;
  if (u === 'FALSE' || u === 'FALSO') return false;
  return ERR.value();
}

/** Representación "General" de un número (hasta 11 cifras significativas, como Excel). */
export function formatGeneralNumber(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E');
  return String(Number(n.toPrecision(11)));
}

/** Comparación de valores (orden: números < texto < booleanos; texto sin distinguir mayúsculas). */
export function compareValues(a: Value, b: Value): number {
  const rank = (v: Value) => (v === null ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 4);
  if (a === null && typeof b === 'number') a = 0;
  if (b === null && typeof a === 'number') b = 0;
  if (a === null && typeof b === 'string') a = '';
  if (b === null && typeof a === 'string') b = '';
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'es', { sensitivity: 'base' });
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return 0;
}
