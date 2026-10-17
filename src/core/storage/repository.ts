import { createId } from '@/core/util/id';
import { getDb } from './db';
import { emitStorageEvent } from './events';
import {
  ConflictError,
  NotFoundError,
  type CreateFileInput,
  type FileMeta,
  type Folder,
  type StorageProvider,
  type VersionEntry,
} from './types';

const MAX_AUTO_VERSIONS = 25;

export function estimateSize(content: unknown): number {
  if (content == null) return 0;
  if (ArrayBuffer.isView(content)) return content.byteLength;
  if (content instanceof ArrayBuffer) return content.byteLength;
  if (typeof Blob !== 'undefined' && content instanceof Blob) return content.size;
  try {
    return JSON.stringify(content).length;
  } catch {
    return 0;
  }
}

/** Proveedor de almacenamiento local sobre IndexedDB. */
export class LocalRepository implements StorageProvider {
  async listFiles(opts: { trashed?: boolean } = {}): Promise<FileMeta[]> {
    const db = await getDb();
    const all = (await db.getAll('files')) as FileMeta[];
    const trashed = opts.trashed ?? false;
    return all.filter((f) => !!f.trashed === trashed).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getFile(id: string): Promise<FileMeta | undefined> {
    const db = await getDb();
    return (await db.get('files', id)) as FileMeta | undefined;
  }

  async requireFile(id: string): Promise<FileMeta> {
    const f = await this.getFile(id);
    if (!f) throw new NotFoundError(id);
    return f;
  }

  async createFile(input: CreateFileInput): Promise<FileMeta> {
    const db = await getDb();
    const now = Date.now();
    const meta: FileMeta = {
      id: createId('f'),
      name: input.name.trim() || 'Sin título',
      kind: input.kind,
      folderId: input.folderId ?? null,
      createdAt: now,
      updatedAt: now,
      openedAt: null,
      revision: 1,
      size: estimateSize(input.content),
      trashed: false,
      templateId: input.templateId ?? null,
    };
    const tx = db.transaction(['files', 'contents'], 'readwrite');
    await tx.objectStore('files').put(meta);
    await tx.objectStore('contents').put({ id: meta.id, content: input.content });
    await tx.done;
    emitStorageEvent({ type: 'changed', id: meta.id });
    return meta;
  }

  async loadContent<T = unknown>(id: string): Promise<T | undefined> {
    const db = await getDb();
    const rec = (await db.get('contents', id)) as { content: T } | undefined;
    return rec?.content;
  }

  /**
   * Guarda el contenido si la revisión almacenada coincide con la esperada.
   * Lanza ConflictError si otra pestaña guardó entretanto.
   */
  async saveContent(id: string, content: unknown, expectedRevision: number, opts: { force?: boolean } = {}): Promise<FileMeta> {
    const db = await getDb();
    const tx = db.transaction(['files', 'contents'], 'readwrite');
    const files = tx.objectStore('files');
    const meta = (await files.get(id)) as FileMeta | undefined;
    if (!meta) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new NotFoundError(id);
    }
    if (!opts.force && meta.revision !== expectedRevision) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new ConflictError(id, expectedRevision, meta.revision);
    }
    const next: FileMeta = { ...meta, revision: meta.revision + 1, updatedAt: Date.now(), size: estimateSize(content) };
    await files.put(next);
    await tx.objectStore('contents').put({ id, content });
    await tx.done;
    emitStorageEvent({ type: 'saved', id, revision: next.revision });
    return next;
  }

  async updateMeta(id: string, patch: Partial<Pick<FileMeta, 'name' | 'folderId' | 'starred' | 'openedAt'>>): Promise<FileMeta> {
    const db = await getDb();
    const meta = await this.requireFile(id);
    const next: FileMeta = { ...meta, ...patch };
    if (patch.name !== undefined) next.name = patch.name.trim() || meta.name;
    await db.put('files', next);
    emitStorageEvent({ type: 'changed', id });
    return next;
  }

  rename(id: string, name: string) {
    return this.updateMeta(id, { name });
  }

  move(id: string, folderId: string | null) {
    return this.updateMeta(id, { folderId });
  }

  markOpened(id: string) {
    return this.updateMeta(id, { openedAt: Date.now() });
  }

  async duplicate(id: string, name?: string): Promise<FileMeta> {
    const meta = await this.requireFile(id);
    const content = await this.loadContent(id);
    return this.createFile({
      name: name ?? `${meta.name} (copia)`,
      kind: meta.kind,
      content: structuredClone(content),
      folderId: meta.folderId,
      templateId: meta.templateId,
    });
  }

  async trash(id: string): Promise<void> {
    const db = await getDb();
    const meta = await this.requireFile(id);
    await db.put('files', { ...meta, trashed: true, trashedAt: Date.now() });
    emitStorageEvent({ type: 'changed', id });
  }

  async restore(id: string): Promise<void> {
    const db = await getDb();
    const meta = await this.requireFile(id);
    await db.put('files', { ...meta, trashed: false, trashedAt: null });
    emitStorageEvent({ type: 'changed', id });
  }

  /** Elimina definitivamente el archivo, su contenido y su historial. */
  async deletePermanently(id: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(['files', 'contents', 'versions'], 'readwrite');
    await tx.objectStore('files').delete(id);
    await tx.objectStore('contents').delete(id);
    const idx = tx.objectStore('versions').index('by-file');
    for (const key of await idx.getAllKeys(id)) await tx.objectStore('versions').delete(key);
    await tx.done;
    emitStorageEvent({ type: 'changed', id });
  }

  async emptyTrash(): Promise<number> {
    const trashed = await this.listFiles({ trashed: true });
    for (const f of trashed) await this.deletePermanently(f.id);
    return trashed.length;
  }

  // ---------- Carpetas ----------

  async listFolders(): Promise<Folder[]> {
    const db = await getDb();
    const all = (await db.getAll('folders')) as Folder[];
    return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    const db = await getDb();
    const folder: Folder = { id: createId('d'), name: name.trim() || 'Nueva carpeta', parentId, createdAt: Date.now() };
    await db.put('folders', folder);
    emitStorageEvent({ type: 'changed' });
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const db = await getDb();
    const folder = (await db.get('folders', id)) as Folder | undefined;
    if (!folder) throw new NotFoundError(id);
    await db.put('folders', { ...folder, name: name.trim() || folder.name });
    emitStorageEvent({ type: 'changed' });
  }

  /** Elimina la carpeta; sus archivos y subcarpetas pasan a la carpeta superior. */
  async deleteFolder(id: string): Promise<void> {
    const db = await getDb();
    const folder = (await db.get('folders', id)) as Folder | undefined;
    if (!folder) return;
    const tx = db.transaction(['folders', 'files'], 'readwrite');
    const files = (await tx.objectStore('files').index('by-folder').getAll(id)) as FileMeta[];
    for (const f of files) await tx.objectStore('files').put({ ...f, folderId: folder.parentId });
    const folders = (await tx.objectStore('folders').getAll()) as Folder[];
    for (const sub of folders.filter((x) => x.parentId === id)) await tx.objectStore('folders').put({ ...sub, parentId: folder.parentId });
    await tx.objectStore('folders').delete(id);
    await tx.done;
    emitStorageEvent({ type: 'changed' });
  }

  // ---------- Historial de versiones ----------

  async listVersions(fileId: string): Promise<Omit<VersionEntry, 'content'>[]> {
    const db = await getDb();
    const all = (await db.getAllFromIndex('versions', 'by-file', fileId)) as VersionEntry[];
    return all.sort((a, b) => b.createdAt - a.createdAt).map(({ content: _c, ...rest }) => rest);
  }

  async createVersion(fileId: string, label: string, auto = false): Promise<VersionEntry> {
    const db = await getDb();
    const meta = await this.requireFile(fileId);
    const content = await this.loadContent(fileId);
    const entry: VersionEntry = {
      id: createId('v'),
      fileId,
      createdAt: Date.now(),
      label,
      auto,
      revision: meta.revision,
      size: estimateSize(content),
      content,
    };
    await db.put('versions', entry);
    if (auto) await this.pruneAutoVersions(fileId);
    return entry;
  }

  private async pruneAutoVersions(fileId: string): Promise<void> {
    const db = await getDb();
    const all = ((await db.getAllFromIndex('versions', 'by-file', fileId)) as VersionEntry[])
      .filter((v) => v.auto)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const old of all.slice(MAX_AUTO_VERSIONS)) await db.delete('versions', old.id);
  }

  async getVersionContent<T = unknown>(versionId: string): Promise<T | undefined> {
    const db = await getDb();
    return ((await db.get('versions', versionId)) as VersionEntry | undefined)?.content as T | undefined;
  }

  /** Restaura una versión. Antes guarda el estado actual como versión para poder deshacer. */
  async restoreVersion(versionId: string): Promise<FileMeta> {
    const db = await getDb();
    const version = (await db.get('versions', versionId)) as VersionEntry | undefined;
    if (!version) throw new NotFoundError(versionId);
    const meta = await this.requireFile(version.fileId);
    await this.createVersion(version.fileId, 'Antes de restaurar una versión', false);
    return this.saveContent(version.fileId, structuredClone(version.content), meta.revision);
  }

  async deleteVersion(versionId: string): Promise<void> {
    const db = await getDb();
    await db.delete('versions', versionId);
  }

  // ---------- Ajustes ----------

  async getSetting<T>(key: string): Promise<T | undefined> {
    const db = await getDb();
    return (await db.get('meta', `setting:${key}`)) as T | undefined;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    const db = await getDb();
    await db.put('meta', value, `setting:${key}`);
  }
}

export const repository = new LocalRepository();
