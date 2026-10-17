import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { DB_VERSION, runMigrations } from './migrations';

export const DB_NAME = 'rounded-desktop';

let dbPromise: Promise<IDBPDatabase<any>> | null = null;

export function getDb(): Promise<IDBPDatabase<any>> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        // runMigrations es síncrono en la práctica (solo crea almacenes)
        void runMigrations(db, oldVersion, newVersion, tx);
      },
      blocked() {
        console.warn('Rounded Desktop: otra pestaña bloquea la actualización de la base de datos.');
      },
      blocking() {
        // Otra pestaña necesita actualizar el esquema: cerramos para no bloquearla.
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Solo para pruebas. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await deleteDB(DB_NAME);
}
