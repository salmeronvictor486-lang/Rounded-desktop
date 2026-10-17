import { repository } from '@/core/storage/repository';
import { editPath, navigate } from '@/app/router';
import { toast } from '@/ui/toast';
import { createFolio } from './model';

/** Guarda un PDF generado como archivo nuevo de Rounded Folio. */
export async function createNewFileFromBytes(bytes: Uint8Array, name: string) {
  const meta = await repository.createFile({ name, kind: 'pdf', content: createFolio(bytes) });
  toast.success(`«${name}» guardado en Mis archivos.`, 'Ábrelo desde Inicio o Mis archivos.');
  return meta;
}

export function openFile(id: string) {
  navigate(editPath(id));
}
