import { Engine } from './engine/engine';
import { shiftFormula } from './engine/parser';
import { getLocale } from './format/locale';
import { formatValue, isDateFormat } from './format/numberFormat';
import { canonicalizeFormula } from './engine/canonical';
import { isError, type Value } from './engine/values';
import { parseInput } from './format/parseInput';
import {
  cellKey,
  internStyle,
  normalizeRange,
  normalizeWorkbook,
  parseKey,
  type CellData,
  type CellStyle,
  type RangeAddr,
  type Sheet,
  type Workbook,
} from './model';
import { validateValue } from './ops/validation';

export interface CellChange {
  key: string;
  before: CellData | undefined;
  after: CellData | undefined;
}

type HistoryEntry =
  | { kind: 'cells'; label: string; sheetId: string; changes: CellChange[] }
  | { kind: 'sheet'; label: string; sheetId: string; before: Sheet; after: Sheet }
  | { kind: 'workbook'; label: string; before: { sheets: Sheet[]; active: number }; after: { sheets: Sheet[]; active: number } };

export interface Selection {
  /** Celda activa. */
  r: number;
  c: number;
  /** Rango seleccionado (incluye la celda activa). */
  range: RangeAddr;
}

const clone = <T,>(x: T): T => structuredClone(x);

/** Estado y operaciones de un libro abierto en Rounded Grid. */
export class SheetController {
  wb: Workbook;
  engine: Engine;
  sel: Selection = { r: 0, c: 0, range: { r1: 0, c1: 0, r2: 0, c2: 0 } };
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<() => void>();
  private _version = 0;
  onChange?: () => void;

  constructor(wb: Workbook) {
    this.wb = normalizeWorkbook(wb);
    this.engine = new Engine(this.wb);
  }

  // ---------- Suscripción (useSyncExternalStore) ----------

  get version() {
    return this._version;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this._version;

  /** Notifica a la interfaz. `dirty` marca el documento como modificado. */
  emit(dirty = true) {
    this._version++;
    this.listeners.forEach((l) => l());
    if (dirty) this.onChange?.();
  }

  // ---------- Hojas ----------

  get sheet(): Sheet {
    return this.wb.sheets[this.wb.activeSheet];
  }

  setActiveSheet(i: number) {
    if (i < 0 || i >= this.wb.sheets.length || i === this.wb.activeSheet) return;
    this.wb.activeSheet = i;
    this.sel = { r: 0, c: 0, range: { r1: 0, c1: 0, r2: 0, c2: 0 } };
    this.emit(false);
  }

  styleOf(cell: CellData | undefined): CellStyle {
    return (cell?.s && this.wb.styles[cell.s]) || {};
  }

  getCell(r: number, c: number, sheet: Sheet = this.sheet): CellData | undefined {
    return sheet.cells[cellKey(r, c)];
  }

  value(r: number, c: number, sheet: Sheet = this.sheet): Value {
    return this.engine.getValue(sheet.id, r, c);
  }

  /** Texto editable de una celda (fórmula con "=" o literal). */
  rawInput(r: number, c: number, sheet: Sheet = this.sheet): string {
    const cell = this.getCell(r, c, sheet);
    if (!cell) return '';
    if (cell.f !== undefined) return `=${cell.f}`;
    if (cell.v === undefined || cell.v === null) return '';
    if (typeof cell.v === 'boolean') return cell.v ? 'VERDADERO' : 'FALSO';
    if (typeof cell.v === 'number') return editableNumber(cell.v, this.styleOf(cell).numFmt);
    // Texto que parece número: conservar como texto con apóstrofo
    const parsed = parseInput(cell.v);
    return typeof parsed.value !== 'string' && cell.v !== '' ? `'${cell.v}` : cell.v;
  }

  // ---------- Historial ----------

  private pushHistory(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undoLabel() {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    this.applyHistory(e, 'before');
    this.redoStack.push(e);
    this.emit();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this.applyHistory(e, 'after');
    this.undoStack.push(e);
    this.emit();
  }

  private applyHistory(e: HistoryEntry, side: 'before' | 'after') {
    if (e.kind === 'cells') {
      const sheet = this.wb.sheets.find((s) => s.id === e.sheetId);
      if (!sheet) return;
      const keys: [number, number][] = [];
      for (const ch of e.changes) {
        const v = side === 'before' ? ch.before : ch.after;
        if (v) sheet.cells[ch.key] = clone(v);
        else delete sheet.cells[ch.key];
        keys.push(parseKey(ch.key));
      }
      this.engine.cellsChanged(sheet.id, keys);
      const idx = this.wb.sheets.indexOf(sheet);
      if (idx !== this.wb.activeSheet) this.wb.activeSheet = idx;
    } else if (e.kind === 'sheet') {
      const idx = this.wb.sheets.findIndex((s) => s.id === e.sheetId);
      if (idx < 0) return;
      this.wb.sheets[idx] = clone(side === 'before' ? e.before : e.after);
      this.wb.activeSheet = idx;
      this.engine.rebuild(this.wb);
    } else {
      const snap = side === 'before' ? e.before : e.after;
      this.wb.sheets = clone(snap.sheets);
      this.wb.activeSheet = Math.min(snap.active, this.wb.sheets.length - 1);
      this.engine.rebuild(this.wb);
    }
  }

  /** Ejecuta un cambio a nivel de hoja guardando una instantánea para deshacer. */
  sheetOp(label: string, fn: (sheet: Sheet) => void, opts: { rebuild?: boolean } = {}) {
    const sheet = this.sheet;
    const before = clone(sheet);
    fn(sheet);
    this.pushHistory({ kind: 'sheet', label, sheetId: sheet.id, before, after: clone(sheet) });
    if (opts.rebuild !== false) this.engine.rebuild(this.wb);
    this.emit();
  }

  /** Cambio a nivel de libro (añadir/eliminar/renombrar hojas). */
  workbookOp(label: string, fn: (wb: Workbook) => void) {
    const before = { sheets: clone(this.wb.sheets), active: this.wb.activeSheet };
    fn(this.wb);
    this.pushHistory({ kind: 'workbook', label, before, after: { sheets: clone(this.wb.sheets), active: this.wb.activeSheet } });
    this.engine.rebuild(this.wb);
    this.emit();
  }

  /** Aplica cambios de celdas registrándolos en el historial. */
  applyCells(label: string, updates: Map<string, CellData | undefined>, sheet: Sheet = this.sheet) {
    const changes: CellChange[] = [];
    const keys: [number, number][] = [];
    for (const [key, next] of updates) {
      const before = sheet.cells[key];
      const clean = next && (next.v !== undefined || next.f !== undefined || (next.s ?? 0) !== 0) ? next : undefined;
      if (JSON.stringify(before) === JSON.stringify(clean)) continue;
      changes.push({ key, before: before && clone(before), after: clean && clone(clean) });
      if (clean) sheet.cells[key] = clean;
      else delete sheet.cells[key];
      keys.push(parseKey(key));
    }
    if (!changes.length) return;
    this.pushHistory({ kind: 'cells', label, sheetId: sheet.id, changes });
    this.engine.cellsChanged(sheet.id, keys);
    this.growToFit(sheet, keys);
    this.emit();
  }

  private growToFit(sheet: Sheet, keys: [number, number][]) {
    for (const [r, c] of keys) {
      if (r + 1 > sheet.rowCount) sheet.rowCount = r + 100;
      if (c + 1 > sheet.colCount) sheet.colCount = c + 5;
    }
  }

  // ---------- Edición de celdas ----------

  /** Construye el contenido de una celda a partir de lo escrito. */
  buildCell(input: string, existing: CellData | undefined): CellData | undefined {
    const s = existing?.s;
    if (input.startsWith('=') && input.length > 1) {
      return { f: canonicalizeFormula(input.slice(1)), ...(s ? { s } : {}) };
    }
    const style = this.styleOf(existing);
    if (style.numFmt === '@') return input === '' ? (s ? { s } : undefined) : { v: input, ...(s ? { s } : {}) };
    const parsed = parseInput(input);
    if (parsed.value === null) return s ? { s } : undefined;
    let styleIdx = s;
    if (parsed.format && (!style.numFmt || style.numFmt === 'General')) styleIdx = internStyle(this.wb, { ...style, numFmt: parsed.format });
    return { v: parsed.value, ...(styleIdx ? { s: styleIdx } : {}) };
  }

  /** Comprueba la validación de datos; devuelve un mensaje de error o null. */
  validate(r: number, c: number, input: string): { message: string; strict: boolean } | null {
    const rules = this.sheet.validations.filter((v) => r >= v.range.r1 && r <= v.range.r2 && c >= v.range.c1 && c <= v.range.c2);
    for (const rule of rules) {
      const msg = validateValue(rule, input, this);
      if (msg) return { message: msg, strict: rule.strict };
    }
    return null;
  }

  setCellInput(r: number, c: number, input: string) {
    const key = cellKey(r, c);
    const next = this.buildCell(input, this.sheet.cells[key]);
    this.applyCells('Escribir', new Map([[key, next]]));
  }

  /** Escribe el mismo valor en todo el rango (Ctrl+Intro), ajustando fórmulas relativas. */
  fillRangeWithInput(range: RangeAddr, input: string, origin: { r: number; c: number }) {
    const updates = new Map<string, CellData | undefined>();
    for (let r = range.r1; r <= range.r2; r++)
      for (let c = range.c1; c <= range.c2; c++) {
        const key = cellKey(r, c);
        let text = input;
        if (input.startsWith('=')) text = `=${shiftFormula(input.slice(1), r - origin.r, c - origin.c)}`;
        updates.set(key, this.buildCell(text, this.sheet.cells[key]));
      }
    this.applyCells('Rellenar', updates);
  }

  /** Celdas existentes dentro de un rango (recorre el diccionario si el rango es enorme). */
  *cellsIn(range: RangeAddr, sheet: Sheet = this.sheet): Generator<[number, number, CellData]> {
    const area = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (area > Object.keys(sheet.cells).length) {
      for (const [k, cell] of Object.entries(sheet.cells)) {
        const [r, c] = parseKey(k);
        if (r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2) yield [r, c, cell];
      }
    } else {
      for (let r = range.r1; r <= range.r2; r++)
        for (let c = range.c1; c <= range.c2; c++) {
          const cell = sheet.cells[cellKey(r, c)];
          if (cell) yield [r, c, cell];
        }
    }
  }

  clearRange(range: RangeAddr, what: 'contents' | 'formats' | 'all' = 'contents') {
    const updates = new Map<string, CellData | undefined>();
    for (const [r, c, cell] of this.cellsIn(range)) {
      const key = cellKey(r, c);
      if (what === 'all') updates.set(key, undefined);
      else if (what === 'contents') updates.set(key, cell.s ? { s: cell.s } : undefined);
      else updates.set(key, { ...(cell.v !== undefined ? { v: cell.v } : {}), ...(cell.f !== undefined ? { f: cell.f } : {}) });
    }
    this.applyCells(what === 'formats' ? 'Borrar formato' : 'Borrar', updates);
  }

  /** Aplica propiedades de estilo a un rango. Para rangos enormes se limita al área usada. */
  applyStyle(range: RangeAddr, patch: Partial<CellStyle> | ((s: CellStyle, r: number, c: number) => CellStyle), label = 'Formato') {
    const r = normalizeRange(range);
    const updates = new Map<string, CellData | undefined>();
    const area = (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
    const apply = (row: number, col: number) => {
      const key = cellKey(row, col);
      const cell = this.sheet.cells[key];
      const style = this.styleOf(cell);
      const next = typeof patch === 'function' ? patch({ ...style }, row, col) : { ...style, ...patch };
      for (const k of Object.keys(next) as (keyof CellStyle)[]) if (next[k] === undefined || next[k] === null) delete next[k];
      const s = internStyle(this.wb, next);
      updates.set(key, { ...(cell ?? {}), s: s || undefined });
    };
    if (area <= 200_000) {
      for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) apply(row, col);
    } else {
      for (const [row, col] of this.cellsIn(r)) apply(row, col);
    }
    this.applyCells(label, updates);
  }

  /** Alterna una propiedad booleana según el estado de la celda activa. */
  toggleStyle(prop: 'bold' | 'italic' | 'underline' | 'strike' | 'wrap') {
    const current = !!this.styleOf(this.getCell(this.sel.r, this.sel.c))[prop];
    this.applyStyle(this.sel.range, { [prop]: !current || undefined } as Partial<CellStyle>);
  }

  // ---------- Selección ----------

  select(r: number, c: number, extend = false) {
    const sheet = this.sheet;
    r = Math.max(0, Math.min(r, Math.max(sheet.rowCount, 1) - 1));
    c = Math.max(0, Math.min(c, Math.max(sheet.colCount, 1) - 1));
    if (extend) {
      this.sel = { ...this.sel, range: normalizeRange({ r1: this.sel.r, c1: this.sel.c, r2: r, c2: c }) };
    } else {
      this.sel = { r, c, range: { r1: r, c1: c, r2: r, c2: c } };
    }
    this.sel.range = this.expandForMerges(this.sel.range);
    this.emit(false);
  }

  selectRange(range: RangeAddr, active?: { r: number; c: number }) {
    const n = normalizeRange(range);
    this.sel = { r: active?.r ?? n.r1, c: active?.c ?? n.c1, range: this.expandForMerges(n) };
    this.emit(false);
  }

  /** Amplía un rango para que incluya completas las celdas combinadas que toca. */
  expandForMerges(range: RangeAddr): RangeAddr {
    let r = { ...range };
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of this.sheet.merges) {
        if (m.r1 <= r.r2 && r.r1 <= m.r2 && m.c1 <= r.c2 && r.c1 <= m.c2) {
          const n = { r1: Math.min(r.r1, m.r1), c1: Math.min(r.c1, m.c1), r2: Math.max(r.r2, m.r2), c2: Math.max(r.c2, m.c2) };
          if (n.r1 !== r.r1 || n.c1 !== r.c1 || n.r2 !== r.r2 || n.c2 !== r.c2) {
            r = n;
            changed = true;
          }
        }
      }
    }
    return r;
  }

  mergeAt(r: number, c: number): RangeAddr | undefined {
    return this.sheet.merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
  }

  /** Último dato en una dirección (Ctrl+flecha). */
  jump(r: number, c: number, dr: number, dc: number): { r: number; c: number } {
    const sheet = this.sheet;
    const has = (rr: number, cc: number) => {
      const cell = sheet.cells[cellKey(rr, cc)];
      return !!cell && (cell.v !== undefined || cell.f !== undefined);
    };
    const maxR = sheet.rowCount - 1;
    const maxC = sheet.colCount - 1;
    const inside = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr <= maxR && cc <= maxC;
    let rr = r + dr;
    let cc = c + dc;
    if (!inside(rr, cc)) return { r, c };
    if (has(r, c) && has(rr, cc)) {
      while (inside(rr + dr, cc + dc) && has(rr + dr, cc + dc)) {
        rr += dr;
        cc += dc;
      }
      return { r: rr, c: cc };
    }
    while (inside(rr, cc) && !has(rr, cc)) {
      if (!inside(rr + dr, cc + dc)) return { r: rr, c: cc };
      rr += dr;
      cc += dc;
    }
    return { r: rr, c: cc };
  }

  /** Región contigua con datos alrededor de una celda (para ordenar/filtrar/gráficos). */
  currentRegion(r: number, c: number): RangeAddr {
    const sheet = this.sheet;
    const has = (rr: number, cc: number) => {
      const cell = sheet.cells[cellKey(rr, cc)];
      return !!cell && (cell.v !== undefined || cell.f !== undefined);
    };
    let range = { r1: r, c1: c, r2: r, c2: c };
    let grew = true;
    let guard = 0;
    while (grew && guard++ < 1000) {
      grew = false;
      const { r1, c1, r2, c2 } = range;
      const rowHas = (rr: number) => {
        for (let cc = Math.max(0, c1 - 1); cc <= c2 + 1; cc++) if (has(rr, cc)) return true;
        return false;
      };
      const colHas = (cc: number) => {
        for (let rr = Math.max(0, r1 - 1); rr <= r2 + 1; rr++) if (has(rr, cc)) return true;
        return false;
      };
      if (r1 > 0 && rowHas(r1 - 1)) (range.r1 = r1 - 1), (grew = true);
      if (rowHas(r2 + 1)) (range.r2 = r2 + 1), (grew = true);
      if (c1 > 0 && colHas(c1 - 1)) (range.c1 = c1 - 1), (grew = true);
      if (colHas(c2 + 1)) (range.c2 = c2 + 1), (grew = true);
      range = { ...range };
    }
    return range;
  }

  /** Contenido para el autoguardado. */
  serialize(): Workbook {
    return this.wb;
  }

  /** Mensajes de estado de la selección: suma, promedio, recuento. */
  selectionStats(): { sum: number; count: number; numeric: number; avg: number | null } | null {
    const r = this.sel.range;
    if (r.r1 === r.r2 && r.c1 === r.c2) return null;
    let sum = 0;
    let count = 0;
    let numeric = 0;
    for (const [row, col] of this.cellsIn(r)) {
      const v = this.value(row, col);
      if (v === null || v === '') continue;
      count++;
      if (typeof v === 'number' && !isError(v)) {
        sum += v;
        numeric++;
      }
    }
    return { sum, count, numeric, avg: numeric ? sum / numeric : null };
  }
}

/** Número editable sin pérdida (fechas como fecha, porcentajes como %). */
function editableNumber(n: number, fmt: string | undefined): string {
  if (fmt && /%/.test(fmt)) return `${String(Number((n * 100).toPrecision(15)))}%`.replace('.', getDecimal());
  if (fmt && isDateLike(fmt)) {
    return formatForEdit(n, fmt);
  }
  return String(Number(n.toPrecision(15))).replace('.', getDecimal());
}

function getDecimal() {
  return getLocale().decimal;
}

function isDateLike(fmt: string) {
  return isDateFormat(fmt);
}

function formatForEdit(n: number, fmt: string): string {
  const hasTime = /h|s/i.test(fmt.replace(/"[^"]*"/g, ''));
  const hasDate = /[dy]/i.test(fmt.replace(/"[^"]*"/g, '')) || /mmm/i.test(fmt);
  const loc = getLocale();
  const datePart = loc.dateOrder === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
  if (hasDate && hasTime) return formatValue(n, `${datePart} hh:mm:ss`).text;
  if (hasTime && !hasDate) return formatValue(n, n >= 1 ? '[h]:mm:ss' : 'hh:mm:ss').text;
  return formatValue(n, datePart).text;
}
