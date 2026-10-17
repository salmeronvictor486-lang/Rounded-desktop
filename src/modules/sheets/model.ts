/** Modelo de datos de Rounded Grid. Filas y columnas empiezan en 0. */

export type Scalar = number | string | boolean | null;

export interface CellData {
  /** Valor literal (número, texto o booleano). */
  v?: number | string | boolean;
  /** Fórmula sin el signo "=". */
  f?: string;
  /** Índice en Workbook.styles. */
  s?: number;
}

export interface BorderDef {
  style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';
  color: string;
}

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  bg?: string;
  fontSize?: number;
  fontFamily?: string;
  hAlign?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  /** Código de formato numérico estilo Excel ("0.00", "#,##0 €", "dd/mm/yyyy"...). */
  numFmt?: string;
  borders?: { top?: BorderDef; right?: BorderDef; bottom?: BorderDef; left?: BorderDef };
}

export interface RangeAddr {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export type ConditionType = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'contains' | 'notContains' | 'empty' | 'notEmpty' | 'colorScale' | 'duplicate';

export interface ConditionalRule {
  id: string;
  range: RangeAddr;
  type: ConditionType;
  values: string[];
  style: { bg?: string; color?: string; bold?: boolean };
  /** Para escalas de color: [mínimo, máximo]. */
  colors?: [string, string];
}

export interface ValidationRule {
  id: string;
  range: RangeAddr;
  type: 'list' | 'number' | 'integer' | 'date' | 'textLength';
  /** Lista: valores permitidos. Número/fecha/longitud: [mínimo, máximo]. */
  values: string[];
  /** Rango de origen de la lista (A1), alternativa a `values`. */
  source?: string;
  allowBlank: boolean;
  strict: boolean;
  message?: string;
}

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'scatter';

export interface ChartDef {
  id: string;
  type: ChartType;
  /** Rango de datos en notación A1 (puede incluir el nombre de la hoja). */
  range: string;
  title: string;
  /** Posición y tamaño en píxeles dentro de la hoja. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** La primera fila/columna contiene encabezados. */
  headers: boolean;
  seriesIn: 'columns' | 'rows';
  legend: boolean;
}

export interface FilterState {
  range: RangeAddr;
  /** Por columna absoluta: valores (como texto mostrado) que se ocultan. */
  hidden: Record<number, string[]>;
}

export interface Sheet {
  id: string;
  name: string;
  cells: Record<string, CellData>;
  rowCount: number;
  colCount: number;
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  merges: RangeAddr[];
  freeze: { rows: number; cols: number };
  conditional: ConditionalRule[];
  validations: ValidationRule[];
  charts: ChartDef[];
  filter?: FilterState | null;
  tabColor?: string | null;
  gridlines?: boolean;
}

export interface Workbook {
  format: 'rounded-grid';
  version: 1;
  sheets: Sheet[];
  styles: CellStyle[];
  activeSheet: number;
}

export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_ROWS = 1000;
export const DEFAULT_COLS = 26;
export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export const cellKey = (r: number, c: number) => `${r},${c}`;
export function parseKey(k: string): [number, number] {
  const i = k.indexOf(',');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

let sheetSeq = 0;
export function newSheetId(): string {
  return `s${Date.now().toString(36)}${(sheetSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createSheet(name: string): Sheet {
  return {
    id: newSheetId(),
    name,
    cells: {},
    rowCount: DEFAULT_ROWS,
    colCount: DEFAULT_COLS,
    colWidths: {},
    rowHeights: {},
    merges: [],
    freeze: { rows: 0, cols: 0 },
    conditional: [],
    validations: [],
    charts: [],
    filter: null,
    gridlines: true,
  };
}

export function createWorkbook(sheetNames = ['Hoja1']): Workbook {
  return { format: 'rounded-grid', version: 1, sheets: sheetNames.map(createSheet), styles: [{}], activeSheet: 0 };
}

export function normalizeWorkbook(w: Partial<Workbook> | null | undefined): Workbook {
  if (!w || !Array.isArray(w.sheets) || !w.sheets.length) return createWorkbook();
  const sheets = w.sheets.map((s) => ({ ...createSheet(s.name || 'Hoja'), ...s, freeze: s.freeze ?? { rows: 0, cols: 0 } }));
  return {
    format: 'rounded-grid',
    version: 1,
    sheets,
    styles: w.styles?.length ? w.styles : [{}],
    activeSheet: Math.min(Math.max(0, w.activeSheet ?? 0), sheets.length - 1),
  };
}

/** Registra un estilo y devuelve su índice (reutiliza estilos idénticos). */
export function internStyle(wb: Workbook, style: CellStyle): number {
  const clean: CellStyle = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined && v !== null && v !== false && v !== '') (clean as any)[k] = v;
  if (clean.borders && !Object.keys(clean.borders).length) delete clean.borders;
  if (!Object.keys(clean).length) return 0;
  const key = JSON.stringify(clean, Object.keys(clean).sort());
  const idx = wb.styles.findIndex((s, i) => i > 0 && JSON.stringify(s, Object.keys(s).sort()) === key);
  if (idx > 0) return idx;
  wb.styles.push(clean);
  return wb.styles.length - 1;
}

export function rangeContains(r: RangeAddr, row: number, col: number): boolean {
  return row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
}

export function normalizeRange(r: RangeAddr): RangeAddr {
  return { r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) };
}

export function rangesIntersect(a: RangeAddr, b: RangeAddr): boolean {
  return a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
}
