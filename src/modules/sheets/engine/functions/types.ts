import type { Node } from '../parser';
import type { EvalResult } from '../values';

export interface FnContext {
  now: Date;
  /** Evalúa un argumento (para funciones perezosas como IF). */
  evalNode(n: Node): EvalResult;
  /** Celda en la que se evalúa la fórmula. */
  cell: { sheetId: string; row: number; col: number };
  /** Rango al que apunta un argumento referencia (ROW, COLUMN, OFFSET...). */
  refOf(n: Node): { sheetId: string; r1: number; c1: number; r2: number; c2: number } | null;
  /** Evalúa un rango arbitrario de una hoja. */
  evalRange(sheetId: string, r1: number, c1: number, r2: number, c2: number): EvalResult;
  markVolatile(): void;
  /** Resuelve una referencia escrita como texto (INDIRECT). */
  indirect(ref: string): EvalResult;
}

export interface FnDef {
  min: number;
  max?: number;
  /** Si es perezosa, `args` llega vacío y se usa ctx.evalNode(nodes[i]). */
  lazy?: boolean;
  impl(args: EvalResult[], ctx: FnContext, nodes: Node[]): EvalResult;
}

export type FnTable = Record<string, FnDef>;
