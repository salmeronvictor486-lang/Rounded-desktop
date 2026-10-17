import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { FileKind, FileMeta } from '@/core/storage/types';

export interface ImportResult<T = unknown> {
  name: string;
  content: T;
  /** Avisos de elementos que no se han podido importar o editar. */
  warnings: string[];
}

export interface EditorSession<T> {
  file: FileMeta;
  initialContent: T;
  /** El editor registra cómo obtener su contenido actual para guardarlo. */
  setSerializer(fn: () => T): void;
  markDirty(): void;
  flush(): Promise<void>;
  rename(name: string): Promise<void>;
}

export interface EditorProps<T> {
  session: EditorSession<T>;
}

export interface AppModule<T = unknown> {
  kind: FileKind;
  icon: LucideIcon;
  /** Clase CSS del color de acento (ver styles/tokens.css). */
  accent: string;
  /** Extensiones importables (en minúsculas, sin punto). */
  importExtensions: string[];
  createEmpty(): T;
  importFile(file: File, bytes: Uint8Array): Promise<ImportResult<T>>;
  /** Formatos a los que se puede exportar sin abrir el editor (el primero es el principal). */
  exports: ExportOption<T>[];
  Editor: LazyExoticComponent<ComponentType<EditorProps<T>>>;
  /** Miniatura de solo lectura (plantillas y tarjetas). */
  Preview: LazyExoticComponent<ComponentType<{ content: T }>>;
}

export interface ExportOption<T = unknown> {
  id: string;
  label: string;
  extension: string;
  run(content: T, file: FileMeta): Promise<Blob>;
}
