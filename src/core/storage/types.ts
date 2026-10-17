export type FileKind = 'document' | 'spreadsheet' | 'presentation' | 'pdf';

export interface FileMeta {
  id: string;
  name: string;
  kind: FileKind;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  openedAt: number | null;
  /** Se incrementa en cada guardado; base de la detección de conflictos. */
  revision: number;
  size: number;
  trashed: boolean;
  trashedAt?: number | null;
  templateId?: string | null;
  starred?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface VersionEntry {
  id: string;
  fileId: string;
  createdAt: number;
  label: string;
  auto: boolean;
  revision: number;
  size: number;
  content: unknown;
}

export interface ContentRecord {
  id: string;
  content: unknown;
}

/** Contrato de un proveedor de almacenamiento (local hoy; nube en el futuro). */
export interface StorageProvider {
  listFiles(opts?: { trashed?: boolean }): Promise<FileMeta[]>;
  getFile(id: string): Promise<FileMeta | undefined>;
  createFile(input: CreateFileInput): Promise<FileMeta>;
  loadContent<T = unknown>(id: string): Promise<T | undefined>;
  saveContent(id: string, content: unknown, expectedRevision: number): Promise<FileMeta>;
  updateMeta(id: string, patch: Partial<Pick<FileMeta, 'name' | 'folderId' | 'starred' | 'openedAt'>>): Promise<FileMeta>;
}

export interface CreateFileInput {
  name: string;
  kind: FileKind;
  content: unknown;
  folderId?: string | null;
  templateId?: string | null;
}

export class ConflictError extends Error {
  constructor(
    readonly fileId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super('El archivo se ha modificado en otra pestaña o ventana.');
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  constructor(readonly fileId: string) {
    super('El archivo no existe o se ha eliminado.');
    this.name = 'NotFoundError';
  }
}
