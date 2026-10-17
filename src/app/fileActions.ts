import { BRAND } from '@/config/brand';
import { repository } from '@/core/storage/repository';
import type { FileKind, FileMeta } from '@/core/storage/types';
import { readFileBytes } from '@/core/files/validate';
import { downloadBlob } from '@/core/files/download';
import { extensionOf, stripExtension } from '@/core/util/format';
import { alertDialog, confirmDialog, promptDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import type { TemplateDef } from '@/templates/types';
import { moduleFor, moduleForExtension } from './registry';
import { editPath, navigate } from './router';
import type { ExportOption } from './types';

export async function createNewFile(
  kind: FileKind,
  opts: { name?: string; folderId?: string | null; template?: TemplateDef; open?: boolean } = {},
): Promise<FileMeta> {
  const mod = moduleFor(kind);
  const content = opts.template ? opts.template.build() : mod.createEmpty();
  const name = opts.name ?? opts.template?.documentName ?? `${BRAND.apps[kind].noun} sin título`;
  const meta = await repository.createFile({ name, kind, content, folderId: opts.folderId ?? null, templateId: opts.template?.id });
  if (opts.open !== false) navigate(editPath(meta.id));
  return meta;
}

/** Importa archivos del ordenador, detectando la aplicación por la extensión. */
export async function importFiles(files: File[], folderId: string | null = null): Promise<FileMeta[]> {
  const created: FileMeta[] = [];
  for (const file of files) {
    const ext = extensionOf(file.name);
    const mod = moduleForExtension(ext);
    if (!mod) {
      if (['doc', 'xls', 'ppt'].includes(ext)) {
        await alertDialog({
          title: 'Formato binario antiguo',
          message:
            `«${file.name}» usa el formato binario de Office 97-2003 (.${ext}), que todavía no se puede abrir directamente.\n\n` +
            `Conviértelo a .${ext}x con LibreOffice (Archivo → Guardar como) o con:\n  soffice --headless --convert-to ${ext}x "${file.name}"\n\nDespués impórtalo aquí.`,
        });
      } else {
        toast.error(`No se reconoce el formato de «${file.name}».`);
      }
      continue;
    }
    try {
      const bytes = await readFileBytes(file);
      const result = await mod.importFile(file, bytes);
      const meta = await repository.createFile({
        name: result.name || stripExtension(file.name),
        kind: mod.kind,
        content: result.content,
        folderId,
      });
      created.push(meta);
      if (result.warnings.length) {
        await alertDialog({
          title: `Importado con avisos: ${file.name}`,
          message:
            'El archivo se ha importado, pero algunos elementos no se pueden editar o conservar:\n\n' +
            Array.from(new Set(result.warnings)).map((w) => `• ${w}`).join('\n'),
        });
      } else {
        toast.success(`«${file.name}» importado.`);
      }
    } catch (err) {
      reportError(err, `No se pudo importar «${file.name}»`);
    }
  }
  if (created.length === 1) navigate(editPath(created[0].id));
  return created;
}

export async function exportFile(meta: FileMeta, option?: ExportOption): Promise<void> {
  const mod = moduleFor(meta.kind);
  const opt = option ?? mod.exports[0];
  if (!opt) return;
  try {
    const content = await repository.loadContent(meta.id);
    const blob = await opt.run(content, meta);
    downloadBlob(blob, `${meta.name}.${opt.extension}`);
  } catch (err) {
    reportError(err, 'No se pudo exportar');
  }
}

export async function renameFileInteractive(meta: FileMeta): Promise<void> {
  const name = await promptDialog({ title: 'Cambiar nombre', message: 'Nombre del archivo', defaultValue: meta.name, confirmLabel: 'Cambiar nombre' });
  if (name && name.trim() && name !== meta.name) await repository.rename(meta.id, name);
}

export async function trashFileInteractive(meta: FileMeta): Promise<void> {
  const ok = await confirmDialog({
    title: 'Mover a la papelera',
    message: `«${meta.name}» se moverá a la papelera. Podrás restaurarlo desde allí.`,
    confirmLabel: 'Mover a la papelera',
    danger: true,
  });
  if (ok) {
    await repository.trash(meta.id);
    toast.info(`«${meta.name}» se ha movido a la papelera.`);
  }
}

export async function deleteForeverInteractive(meta: FileMeta): Promise<void> {
  const ok = await confirmDialog({
    title: 'Eliminar definitivamente',
    message: `«${meta.name}» y todo su historial de versiones se eliminarán de forma permanente. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar para siempre',
    danger: true,
  });
  if (ok) await repository.deletePermanently(meta.id);
}
