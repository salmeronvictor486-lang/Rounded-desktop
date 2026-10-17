import { beforeEach, describe, expect, it } from 'vitest';
import { repository } from '@/core/storage/repository';
import { resetDbForTests } from '@/core/storage/db';
import { ConflictError } from '@/core/storage/types';
import { AutosaveController } from '@/core/storage/autosave';
import { exportBackup, importBackup } from '@/core/storage/backup';

beforeEach(async () => {
  await resetDbForTests();
});

describe('Repositorio local (IndexedDB)', () => {
  it('crea, guarda y recupera documentos', async () => {
    const meta = await repository.createFile({ name: 'Informe', kind: 'document', content: { a: 1 } });
    expect(meta.revision).toBe(1);
    const saved = await repository.saveContent(meta.id, { a: 2 }, 1);
    expect(saved.revision).toBe(2);
    expect(await repository.loadContent(meta.id)).toEqual({ a: 2 });
    expect((await repository.listFiles()).map((f) => f.name)).toEqual(['Informe']);
  });

  it('detecta conflictos de guardado entre pestañas', async () => {
    const meta = await repository.createFile({ name: 'X', kind: 'document', content: 1 });
    await repository.saveContent(meta.id, 2, 1);
    await expect(repository.saveContent(meta.id, 3, 1)).rejects.toBeInstanceOf(ConflictError);
    // Forzar sobrescritura
    const forced = await repository.saveContent(meta.id, 3, 1, { force: true });
    expect(forced.revision).toBe(3);
  });

  it('renombra, duplica, mueve a carpetas, papelera y borrado definitivo', async () => {
    const meta = await repository.createFile({ name: 'Doc', kind: 'spreadsheet', content: { x: [1, 2] } });
    await repository.rename(meta.id, 'Presupuesto');
    const copy = await repository.duplicate(meta.id);
    expect(copy.name).toBe('Presupuesto (copia)');
    expect(await repository.loadContent(copy.id)).toEqual({ x: [1, 2] });
    const folder = await repository.createFolder('Trabajo');
    await repository.move(meta.id, folder.id);
    expect((await repository.getFile(meta.id))!.folderId).toBe(folder.id);
    await repository.deleteFolder(folder.id);
    expect((await repository.getFile(meta.id))!.folderId).toBeNull();
    await repository.trash(meta.id);
    expect((await repository.listFiles()).map((f) => f.id)).toEqual([copy.id]);
    expect((await repository.listFiles({ trashed: true })).map((f) => f.id)).toEqual([meta.id]);
    await repository.restore(meta.id);
    await repository.deletePermanently(meta.id);
    expect(await repository.getFile(meta.id)).toBeUndefined();
    expect(await repository.loadContent(meta.id)).toBeUndefined();
  });

  it('historial de versiones: crear, restaurar (guardando el estado actual) y podar automáticas', async () => {
    const meta = await repository.createFile({ name: 'V', kind: 'document', content: 'v1' });
    const v1 = await repository.createVersion(meta.id, 'Primera');
    await repository.saveContent(meta.id, 'v2', 1);
    await repository.restoreVersion(v1.id);
    expect(await repository.loadContent(meta.id)).toBe('v1');
    const versions = await repository.listVersions(meta.id);
    expect(versions.map((v) => v.label)).toContain('Antes de restaurar una versión');
    for (let i = 0; i < 30; i++) await repository.createVersion(meta.id, `auto ${i}`, true);
    const autos = (await repository.listVersions(meta.id)).filter((v) => v.auto);
    expect(autos.length).toBe(25);
  });

  it('el autoguardado agrupa cambios y marca conflicto', async () => {
    const meta = await repository.createFile({ name: 'A', kind: 'document', content: 0 });
    let value = 0;
    const statuses: string[] = [];
    const ctrl = new AutosaveController(meta.id, meta.revision, () => value, { delay: 10, onStatus: (s) => statuses.push(s) });
    value = 1;
    ctrl.markDirty();
    value = 2;
    ctrl.markDirty();
    await ctrl.flush();
    expect(await repository.loadContent(meta.id)).toBe(2);
    expect(statuses.at(-1)).toBe('saved');
    // Otra "pestaña" guarda
    await repository.saveContent(meta.id, 99, ctrl.currentRevision);
    value = 3;
    ctrl.markDirty();
    await ctrl.flush();
    expect(ctrl.currentStatus).toBe('conflict');
    expect(await repository.loadContent(meta.id)).toBe(99);
    await ctrl.overwrite();
    expect(await repository.loadContent(meta.id)).toBe(3);
  });

  it('copia de seguridad: exporta e importa sin pisar archivos existentes', async () => {
    const a = await repository.createFile({ name: 'Uno', kind: 'document', content: { t: 'hola' } });
    const pdf = await repository.createFile({ name: 'PDF', kind: 'pdf', content: new Uint8Array([37, 80, 68, 70]) });
    const blob = await exportBackup();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const res = await importBackup(bytes);
    expect(res.files).toBe(2);
    const files = await repository.listFiles();
    expect(files).toHaveLength(4);
    const restoredPdf = files.find((f) => f.kind === 'pdf' && f.id !== pdf.id)!;
    expect(Array.from((await repository.loadContent<Uint8Array>(restoredPdf.id))!)).toEqual([37, 80, 68, 70]);
    expect(files.some((f) => f.name === 'Uno (restaurado)' && f.id !== a.id)).toBe(true);
  });
});
