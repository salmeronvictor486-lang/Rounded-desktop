import { createId } from '@/core/util/id';

export type AnnotationType = 'highlight' | 'rect' | 'note' | 'text' | 'strike';

/** Anotación en coordenadas PDF (puntos, origen abajo a la izquierda) de la página sin girar. */
export interface Annotation {
  id: string;
  pageId: string;
  type: AnnotationType;
  rect: [number, number, number, number];
  color: string;
  text?: string;
  fontSize?: number;
  createdAt: number;
}

export interface FolioContent {
  format: 'rounded-folio';
  version: 1;
  bytes: Uint8Array;
  /** Identificador estable de cada página (para conservar anotaciones al reordenar). */
  pageIds: string[];
  annotations: Annotation[];
}

export function createFolio(bytes: Uint8Array = new Uint8Array(), pages = 0): FolioContent {
  return { format: 'rounded-folio', version: 1, bytes, pageIds: Array.from({ length: pages }, () => createId('p')), annotations: [] };
}

export function normalizeFolio(c: Partial<FolioContent> | Uint8Array | null | undefined): FolioContent {
  if (!c) return createFolio();
  if (c instanceof Uint8Array || Object.prototype.toString.call(c) === '[object Uint8Array]') return createFolio(c as Uint8Array);
  const f = c as Partial<FolioContent>;
  return { format: 'rounded-folio', version: 1, bytes: f.bytes ?? new Uint8Array(), pageIds: f.pageIds ?? [], annotations: f.annotations ?? [] };
}
