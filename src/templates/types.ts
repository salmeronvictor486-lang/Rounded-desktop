import type { FileKind } from '@/core/storage/types';

export type TemplateCategory =
  | 'Currículums'
  | 'Cartas'
  | 'Informes'
  | 'Académico'
  | 'Apuntes'
  | 'Facturas y presupuestos'
  | 'Planificación'
  | 'Finanzas'
  | 'Proyectos'
  | 'Empresa'
  | 'Tecnología'
  | 'Educación'
  | 'Portfolios';

export interface TemplateDef<T = unknown> {
  id: string;
  kind: FileKind;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Nombre sugerido para el documento nuevo. */
  documentName?: string;
  /** Construye el contenido editable (se llama cada vez que se crea un documento). */
  build(): T;
}
