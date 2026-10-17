import { cellKey, type CellData, type Sheet, type Workbook } from '../model';
import { parseRangeRef } from './address';
import { resolveFunction } from './functions';
import type { FnContext } from './functions/types';
import { EMPTY_ARG, ParseError, parseFormula, type Node } from './parser';
import { ERR, FormulaError, RangeValue, compareValues, isError, toNumber, toText, type EvalResult, type Value } from './values';

type CellId = string; // "sheetId|r,c"

const cid = (sheetId: string, r: number, c: number): CellId => `${sheetId}|${r},${c}`;
function splitCid(id: CellId): { sheetId: string; r: number; c: number } {
  const bar = id.indexOf('|');
  const comma = id.indexOf(',', bar);
  return { sheetId: id.slice(0, bar), r: Number(id.slice(bar + 1, comma)), c: Number(id.slice(comma + 1)) };
}

interface RangeDep {
  sheetId: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  dependent: CellId;
}

interface CompiledFormula {
  ast: Node | null;
  error?: FormulaError;
  cellRefs: CellId[];
  ranges: RangeDep[];
  volatile: boolean;
}

/** Límite de seguridad para rangos enormes (A:A) en hojas con muchos datos. */
const MAX_RANGE_CELLS = 5_000_000;

/**
 * Motor de cálculo. Mantiene una caché de valores y un grafo de
 * dependencias; al modificar una celda solo se invalidan sus dependientes
 * transitivos, que se recalculan bajo demanda.
 */
export class Engine {
  private values = new Map<CellId, Value | RangeValue>();
  private compiled = new Map<CellId, CompiledFormula>();
  private dependents = new Map<CellId, Set<CellId>>();
  private rangeDeps: RangeDep[] = [];
  private volatile = new Set<CellId>();
  private evaluating = new Set<CellId>();
  private sheetsById = new Map<string, Sheet>();
  private sheetsByName = new Map<string, Sheet>();
  now = new Date();

  constructor(private wb: Workbook) {
    this.rebuild();
  }

  /** Reconstruye todo (al cargar o tras cambios estructurales). */
  rebuild(wb: Workbook = this.wb): void {
    this.wb = wb;
    this.values.clear();
    this.compiled.clear();
    this.dependents.clear();
    this.rangeDeps = [];
    this.volatile.clear();
    this.indexSheets();
    for (const sheet of wb.sheets) {
      for (const [key, cell] of Object.entries(sheet.cells)) {
        if (cell.f !== undefined) {
          const [r, c] = key.split(',').map(Number);
          this.compile(sheet.id, r, c, cell.f);
        }
      }
    }
  }

  private indexSheets() {
    this.sheetsById.clear();
    this.sheetsByName.clear();
    for (const s of this.wb.sheets) {
      this.sheetsById.set(s.id, s);
      this.sheetsByName.set(s.name.toLowerCase(), s);
    }
  }

  get workbook(): Workbook {
    return this.wb;
  }

  sheetByName(name: string): Sheet | undefined {
    return this.sheetsByName.get(name.toLowerCase());
  }

  /** Notifica que se han añadido/renombrado/eliminado hojas. */
  sheetsChanged(): void {
    this.rebuild();
  }

  private removeDeps(id: CellId) {
    const old = this.compiled.get(id);
    if (!old) return;
    for (const ref of old.cellRefs) this.dependents.get(ref)?.delete(id);
    if (old.ranges.length) this.rangeDeps = this.rangeDeps.filter((d) => d.dependent !== id);
    this.compiled.delete(id);
    this.volatile.delete(id);
  }

  private compile(sheetId: string, r: number, c: number, formula: string) {
    const id = cid(sheetId, r, c);
    this.removeDeps(id);
    const comp: CompiledFormula = { ast: null, cellRefs: [], ranges: [], volatile: false };
    try {
      comp.ast = parseFormula(formula);
      this.collectRefs(comp.ast, sheetId, comp, id);
    } catch (e) {
      comp.error = new FormulaError(e instanceof ParseError ? '#NAME?' : '#VALUE!', e instanceof Error ? e.message : String(e));
    }
    this.compiled.set(id, comp);
    for (const ref of comp.cellRefs) {
      let set = this.dependents.get(ref);
      if (!set) this.dependents.set(ref, (set = new Set()));
      set.add(id);
    }
    this.rangeDeps.push(...comp.ranges);
    if (comp.volatile) this.volatile.add(id);
  }

  private collectRefs(n: Node, sheetId: string, comp: CompiledFormula, self: CellId) {
    switch (n.k) {
      case 'ref': {
        const target = n.sheet !== undefined ? this.sheetByName(n.sheet)?.id : sheetId;
        if (target) comp.cellRefs.push(cid(target, n.row, n.col));
        break;
      }
      case 'range': {
        const target = n.sheet !== undefined ? this.sheetByName(n.sheet)?.id : sheetId;
        if (target) comp.ranges.push({ sheetId: target, r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2, dependent: self });
        break;
      }
      case 'func': {
        const up = n.name;
        if (['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'OFFSET', 'INDIRECT', 'AHORA', 'HOY', 'ALEATORIO', 'ALEATORIO.ENTRE', 'DESREF', 'INDIRECTO'].includes(up)) comp.volatile = true;
        n.args.forEach((a) => this.collectRefs(a, sheetId, comp, self));
        break;
      }
      case 'un':
      case 'pct':
        this.collectRefs(n.arg, sheetId, comp, self);
        break;
      case 'bin':
        this.collectRefs(n.l, sheetId, comp, self);
        this.collectRefs(n.r, sheetId, comp, self);
        break;
      case 'arr':
        n.rows.forEach((row) => row.forEach((x) => this.collectRefs(x, sheetId, comp, self)));
        break;
      default:
        break;
    }
  }

  /** Invalida la caché de una celda y de todo lo que depende de ella. */
  private invalidate(start: CellId[]) {
    const stack = [...start];
    const seen = new Set<CellId>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      this.values.delete(id);
      const direct = this.dependents.get(id);
      if (direct) for (const d of direct) stack.push(d);
      const { sheetId, r, c } = splitCid(id);
      for (const rd of this.rangeDeps) {
        if (rd.sheetId === sheetId && r >= rd.r1 && r <= rd.r2 && c >= rd.c1 && c <= rd.c2) stack.push(rd.dependent);
      }
    }
  }

  /** Llamar después de modificar una celda en el modelo. */
  cellChanged(sheetId: string, r: number, c: number): void {
    const sheet = this.sheetsById.get(sheetId);
    const cell = sheet?.cells[cellKey(r, c)];
    const id = cid(sheetId, r, c);
    if (cell?.f !== undefined) this.compile(sheetId, r, c, cell.f);
    else this.removeDeps(id);
    this.invalidate([id]);
  }

  /** Varias celdas a la vez (pegar, rellenar, ordenar). */
  cellsChanged(sheetId: string, keys: Iterable<[number, number]>): void {
    const ids: CellId[] = [];
    const sheet = this.sheetsById.get(sheetId);
    for (const [r, c] of keys) {
      const id = cid(sheetId, r, c);
      const cell = sheet?.cells[cellKey(r, c)];
      if (cell?.f !== undefined) this.compile(sheetId, r, c, cell.f);
      else this.removeDeps(id);
      ids.push(id);
    }
    this.invalidate(ids);
  }

  /** Recalcula funciones volátiles (AHORA, ALEATORIO...). */
  recalcVolatile(): void {
    this.now = new Date();
    this.invalidate([...this.volatile]);
  }

  /** Valor calculado de una celda (sin formato). */
  getValue(sheetId: string, r: number, c: number): Value {
    const v = this.getRaw(sheetId, r, c);
    return v instanceof RangeValue ? v.topLeft() : v;
  }

  private getRaw(sheetId: string, r: number, c: number): Value | RangeValue {
    const id = cid(sheetId, r, c);
    const cached = this.values.get(id);
    if (cached !== undefined) return cached;
    const sheet = this.sheetsById.get(sheetId);
    const cell = sheet?.cells[cellKey(r, c)];
    if (!cell || cell.f === undefined) return literal(cell);
    this.ensurePrecedents(id);
    return this.evaluateCell(id, sheetId, r, c);
  }

  /**
   * Evalúa de forma iterativa las referencias directas pendientes antes de la
   * celda, para que cadenas largas (A2=A1+1, A3=A2+1, …) no desborden la pila.
   */
  private ensurePrecedents(root: CellId) {
    const stack: CellId[] = [root];
    const visiting = new Set<CellId>();
    let guard = 0;
    while (stack.length && guard++ < 2_000_000) {
      const id = stack[stack.length - 1];
      if (this.values.has(id)) {
        stack.pop();
        continue;
      }
      const comp = this.compiled.get(id);
      if (!comp) {
        stack.pop();
        continue;
      }
      if (visiting.has(id)) {
        stack.pop();
        if (id !== root) {
          const { sheetId, r, c } = splitCid(id);
          this.evaluateCell(id, sheetId, r, c);
        }
        continue;
      }
      visiting.add(id);
      for (const ref of comp.cellRefs) {
        if (!this.values.has(ref) && this.compiled.has(ref) && !visiting.has(ref)) stack.push(ref);
      }
    }
  }

  private evaluateCell(id: CellId, sheetId: string, r: number, c: number): Value | RangeValue {
    const comp = this.compiled.get(id);
    if (!comp) return null;
    if (this.evaluating.has(id)) return ERR.circ();
    if (comp.error) {
      this.values.set(id, comp.error);
      return comp.error;
    }
    this.evaluating.add(id);
    let result: EvalResult;
    try {
      result = this.evalNode(comp.ast!, { sheetId, row: r, col: c }, id);
    } catch (e) {
      result = ERR.value(e instanceof Error ? e.message : String(e));
    } finally {
      this.evaluating.delete(id);
    }
    // Las fórmulas que dependen de un ciclo también muestran el error de ciclo
    let stored: Value | RangeValue = result instanceof RangeValue ? result : result;
    if (result instanceof RangeValue && result.height === 1 && result.width === 1) stored = result.topLeft();
    if (typeof stored === 'number' && !Number.isFinite(stored)) stored = ERR.num();
    this.values.set(id, stored);
    return stored;
  }

  /** Matriz de valores de un rango (limitada al área con datos). */
  rangeValues(sheetId: string, r1: number, c1: number, r2: number, c2: number): RangeValue | FormulaError {
    const sheet = this.sheetsById.get(sheetId);
    if (!sheet) return ERR.ref();
    // Rangos de columna/fila completa: recortar al tamaño usado
    const maxR = Math.min(r2, Math.max(sheet.rowCount, usedRows(sheet)) - 1);
    const maxC = Math.min(c2, Math.max(sheet.colCount, usedCols(sheet)) - 1);
    if (maxR < r1 || maxC < c1) return new RangeValue([[null]]);
    if ((maxR - r1 + 1) * (maxC - c1 + 1) > MAX_RANGE_CELLS) return ERR.num('Rango demasiado grande');
    const rows: Value[][] = [];
    for (let r = r1; r <= maxR; r++) {
      const row: Value[] = [];
      for (let c = c1; c <= maxC; c++) row.push(this.getValue(sheetId, r, c));
      rows.push(row);
    }
    return new RangeValue(rows);
  }

  private evalNode(n: Node, at: { sheetId: string; row: number; col: number }, self: CellId): EvalResult {
    switch (n.k) {
      case 'num':
        return n.v;
      case 'str':
        return n.v;
      case 'bool':
        return n.v;
      case 'err':
        return n.v;
      case 'name':
        if (n.name === '__EMPTY__') return null;
        return ERR.name(`Nombre desconocido: ${n.name}`);
      case 'ref': {
        const sid = n.sheet !== undefined ? this.sheetByName(n.sheet)?.id : at.sheetId;
        if (!sid) return ERR.ref(`La hoja «${n.sheet}» no existe`);
        if (cid(sid, n.row, n.col) === self) return ERR.circ();
        const v = this.getRaw(sid, n.row, n.col);
        return v instanceof RangeValue ? v.topLeft() : v;
      }
      case 'range': {
        const sid = n.sheet !== undefined ? this.sheetByName(n.sheet)?.id : at.sheetId;
        if (!sid) return ERR.ref(`La hoja «${n.sheet}» no existe`);
        if (sid === at.sheetId && at.row >= n.r1 && at.row <= n.r2 && at.col >= n.c1 && at.col <= n.c2) return ERR.circ();
        return this.rangeValues(sid, n.r1, n.c1, n.r2, n.c2);
      }
      case 'arr':
        return new RangeValue(
          n.rows.map((row) =>
            row.map((x) => {
              const v = this.evalNode(x, at, self);
              return v instanceof RangeValue ? v.topLeft() : v;
            }),
          ),
        );
      case 'pct': {
        const v = this.evalNode(n.arg, at, self);
        return mapScalar(v, (x) => {
          const num = toNumber(x);
          return isError(num) ? num : num / 100;
        });
      }
      case 'un': {
        const v = this.evalNode(n.arg, at, self);
        return mapScalar(v, (x) => {
          const num = toNumber(x);
          if (isError(num)) return num;
          return n.op === '-' ? -num : num;
        });
      }
      case 'bin': {
        const l = this.evalNode(n.l, at, self);
        const r = this.evalNode(n.r, at, self);
        return binary(n.op, l, r);
      }
      case 'func': {
        const fn = resolveFunction(n.name);
        if (!fn) return ERR.name(`La función ${n.name} no existe`);
        const { def } = fn;
        if (n.args.length < def.min || (def.max !== undefined && n.args.length > def.max)) {
          return ERR.value(`${fn.canonical} admite ${def.min}${def.max === undefined ? ' o más' : def.max !== def.min ? `–${def.max}` : ''} argumentos`);
        }
        const ctx: FnContext = {
          now: this.now,
          cell: at,
          evalNode: (x) => (x === EMPTY_ARG ? null : this.evalNode(x, at, self)),
          refOf: (x) => this.refOf(x, at.sheetId),
          evalRange: (sid, r1, c1, r2, c2) => this.rangeValues(sid, r1, c1, r2, c2),
          markVolatile: () => this.volatile.add(self),
          indirect: (text) => {
            const parsed = parseRangeRef(text);
            if (!parsed) return ERR.ref();
            const sid = parsed.sheet !== undefined ? this.sheetByName(parsed.sheet)?.id : at.sheetId;
            if (!sid) return ERR.ref();
            const { r1, c1, r2, c2 } = parsed.range;
            if (r1 === r2 && c1 === c2) return this.getValue(sid, r1, c1);
            return this.rangeValues(sid, r1, c1, r2, c2);
          },
        };
        if (def.lazy) return def.impl([], ctx, n.args);
        const args = n.args.map((a) => (a.k === 'name' && a.name === '__EMPTY__' ? null : this.evalNode(a, at, self)));
        return def.impl(args, ctx, n.args);
      }
    }
  }

  private refOf(n: Node, sheetId: string) {
    if (n.k === 'ref') {
      const sid = n.sheet !== undefined ? this.sheetByName(n.sheet)?.id : sheetId;
      return sid ? { sheetId: sid, r1: n.row, c1: n.col, r2: n.row, c2: n.col } : null;
    }
    if (n.k === 'range') {
      const sid = n.sheet !== undefined ? this.sheetByName(n.sheet)?.id : sheetId;
      return sid ? { sheetId: sid, r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2 } : null;
    }
    return null;
  }

  /** Evalúa una fórmula suelta (validaciones, formato condicional, pruebas). */
  evaluateFormula(formula: string, sheetId: string, row = 0, col = 0): Value {
    try {
      const ast = parseFormula(formula);
      const v = this.evalNode(ast, { sheetId, row, col }, '__adhoc__');
      return v instanceof RangeValue ? v.topLeft() : v;
    } catch (e) {
      return ERR.name(e instanceof Error ? e.message : String(e));
    }
  }

  /** Celdas de las que depende directamente una fórmula (para resaltar al editar). */
  precedentsOf(sheetId: string, r: number, c: number): { cells: CellId[]; ranges: RangeDep[] } {
    const comp = this.compiled.get(cid(sheetId, r, c));
    return { cells: comp?.cellRefs ?? [], ranges: comp?.ranges ?? [] };
  }
}

function literal(cell: CellData | undefined): Value {
  if (!cell || cell.v === undefined || cell.v === '') return null;
  return cell.v;
}

function usedRows(sheet: Sheet): number {
  let max = 0;
  for (const k of Object.keys(sheet.cells)) {
    const r = Number(k.slice(0, k.indexOf(',')));
    if (r + 1 > max) max = r + 1;
  }
  return max;
}

function usedCols(sheet: Sheet): number {
  let max = 0;
  for (const k of Object.keys(sheet.cells)) {
    const c = Number(k.slice(k.indexOf(',') + 1));
    if (c + 1 > max) max = c + 1;
  }
  return max;
}

function mapScalar(v: EvalResult, f: (x: Value) => Value): EvalResult {
  if (v instanceof RangeValue) return new RangeValue(v.rows.map((r) => r.map(f)));
  return f(v);
}

function binScalar(op: string, a: Value, b: Value): Value {
  if (isError(a)) return a;
  if (isError(b)) return b;
  switch (op) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '^': {
      const x = toNumber(a);
      const y = toNumber(b);
      if (isError(x)) return x;
      if (isError(y)) return y;
      if (op === '+') return x + y;
      if (op === '-') return x - y;
      if (op === '*') return x * y;
      if (op === '/') return y === 0 ? ERR.div0() : x / y;
      if (x === 0 && y < 0) return ERR.div0();
      const p = Math.pow(x, y);
      return Number.isFinite(p) ? p : ERR.num();
    }
    case '&': {
      const x = toText(a);
      const y = toText(b);
      if (isError(x)) return x;
      if (isError(y)) return y;
      return x + y;
    }
    default: {
      const c = compareValues(a, b);
      switch (op) {
        case '=':
          return c === 0;
        case '<>':
          return c !== 0;
        case '<':
          return c < 0;
        case '>':
          return c > 0;
        case '<=':
          return c <= 0;
        case '>=':
          return c >= 0;
      }
      return ERR.value();
    }
  }
}

/** Operación binaria con difusión elemento a elemento (fórmulas matriciales sencillas). */
function binary(op: string, l: EvalResult, r: EvalResult): EvalResult {
  if (!(l instanceof RangeValue) && !(r instanceof RangeValue)) return binScalar(op, l, r);
  const lm = l instanceof RangeValue ? l.rows : [[l]];
  const rm = r instanceof RangeValue ? r.rows : [[r]];
  const h = Math.max(lm.length, rm.length);
  const w = Math.max(lm[0]?.length ?? 0, rm[0]?.length ?? 0);
  const out: Value[][] = [];
  for (let i = 0; i < h; i++) {
    const row: Value[] = [];
    for (let j = 0; j < w; j++) {
      const a = lm.length === 1 ? lm[0][lm[0].length === 1 ? 0 : j] : lm[i]?.[lm[0].length === 1 ? 0 : j];
      const b = rm.length === 1 ? rm[0][rm[0].length === 1 ? 0 : j] : rm[i]?.[rm[0].length === 1 ? 0 : j];
      row.push(a === undefined || b === undefined ? ERR.na() : binScalar(op, a, b));
    }
    out.push(row);
  }
  return new RangeValue(out);
}
