import type { IDBPDatabase, IDBPTransaction } from 'idb';

/**
 * Migraciones del esquema de IndexedDB. Cada entrada transforma la base de
 * datos de la versión `index` a `index + 1`. Nunca reordenar ni eliminar
 * pasos existentes: solo añadir al final.
 */
type Migration = (db: IDBPDatabase<any>, tx: IDBPTransaction<any, any, 'versionchange'>) => void | Promise<void>;

export const MIGRATIONS: Migration[] = [
  // v0 → v1: esquema inicial
  (db) => {
    const files = db.createObjectStore('files', { keyPath: 'id' });
    files.createIndex('by-folder', 'folderId');
    files.createIndex('by-updated', 'updatedAt');
    files.createIndex('by-kind', 'kind');
    db.createObjectStore('contents', { keyPath: 'id' });
    db.createObjectStore('folders', { keyPath: 'id' });
    const versions = db.createObjectStore('versions', { keyPath: 'id' });
    versions.createIndex('by-file', 'fileId');
    db.createObjectStore('meta');
  },
];

export const DB_VERSION = MIGRATIONS.length;

export async function runMigrations(
  db: IDBPDatabase<any>,
  oldVersion: number,
  newVersion: number | null,
  tx: IDBPTransaction<any, any, 'versionchange'>,
): Promise<void> {
  const target = newVersion ?? DB_VERSION;
  for (let v = oldVersion; v < target; v++) {
    await MIGRATIONS[v](db, tx);
  }
}
