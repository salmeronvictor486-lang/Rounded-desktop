import JSZip from 'jszip';
import { inspectZip } from '@/core/files/zipGuard';
import { FileFormatError } from '@/core/files/errors';
import { getDb } from './db';
import { emitStorageEvent } from './events';
import { createId } from '@/core/util/id';
import type { FileMeta, Folder } from './types';

const BACKUP_FORMAT = 'rounded-desktop-backup';

/** Comprobación robusta entre contextos (iframes, workers, entornos de prueba). */
function isBytes(v: unknown): v is Uint8Array {
  return v instanceof Uint8Array || Object.prototype.toString.call(v) === '[object Uint8Array]';
}
const BACKUP_VERSION = 1;

interface Manifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  files: FileMeta[];
  folders: Folder[];
}

/** Exporta todos los archivos, carpetas y contenidos (sin historial) a un ZIP. */
export async function exportBackup(): Promise<Blob> {
  const db = await getDb();
  const files = (await db.getAll('files')) as FileMeta[];
  const folders = (await db.getAll('folders')) as Folder[];
  const zip = new JSZip();
  const manifest: Manifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: Date.now(), files, folders };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  for (const f of files) {
    const rec = (await db.get('contents', f.id)) as { content: unknown } | undefined;
    const c = rec?.content;
    if (isBytes(c)) zip.file(`contents/${f.id}.bin`, new Uint8Array(c.buffer, c.byteOffset, c.byteLength));
    else zip.file(`contents/${f.id}.json`, JSON.stringify(c ?? null));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Importa una copia de seguridad. Los archivos existentes con el mismo id no se sobrescriben: se crean copias. */
export async function importBackup(data: Uint8Array): Promise<{ files: number; folders: number }> {
  inspectZip(data);
  const zip = await JSZip.loadAsync(data);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new FileFormatError('La copia de seguridad no contiene manifest.json.');
  const manifest = JSON.parse(await manifestFile.async('string')) as Manifest;
  if (manifest.format !== BACKUP_FORMAT || manifest.version > BACKUP_VERSION) {
    throw new FileFormatError('El archivo no es una copia de seguridad compatible de Rounded Desktop.');
  }
  const db = await getDb();
  const folderMap = new Map<string, string>();
  for (const folder of manifest.folders) {
    const exists = await db.get('folders', folder.id);
    folderMap.set(folder.id, exists ? createId('d') : folder.id);
  }
  for (const folder of manifest.folders) {
    await db.put('folders', {
      ...folder,
      id: folderMap.get(folder.id)!,
      parentId: folder.parentId ? folderMap.get(folder.parentId) ?? null : null,
    });
  }
  let count = 0;
  for (const meta of manifest.files) {
    const bin = zip.file(`contents/${meta.id}.bin`);
    const json = zip.file(`contents/${meta.id}.json`);
    let content: unknown = null;
    if (bin) content = await bin.async('uint8array');
    else if (json) content = JSON.parse(await json.async('string'));
    else continue;
    const exists = await db.get('files', meta.id);
    const id = exists ? createId('f') : meta.id;
    const tx = db.transaction(['files', 'contents'], 'readwrite');
    await tx.objectStore('files').put({
      ...meta,
      id,
      name: exists ? `${meta.name} (restaurado)` : meta.name,
      folderId: meta.folderId ? folderMap.get(meta.folderId) ?? null : null,
    });
    await tx.objectStore('contents').put({ id, content });
    await tx.done;
    count++;
  }
  emitStorageEvent({ type: 'changed' });
  return { files: count, folders: manifest.folders.length };
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

/** Solicita almacenamiento persistente para que el navegador no borre los documentos bajo presión de espacio. */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
