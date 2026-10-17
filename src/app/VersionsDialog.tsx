import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { repository } from '@/core/storage/repository';
import type { VersionEntry } from '@/core/storage/types';
import { formatBytes } from '@/core/util/format';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { confirmDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import { useEditorContext } from './EditorHost';

export function VersionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useEditorContext();
  const [versions, setVersions] = useState<Omit<VersionEntry, 'content'>[] | null>(null);

  const refresh = () => void repository.listVersions(ctx.file.id).then(setVersions, reportError);
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ctx.file.id]);

  return (
    <Dialog open={open} onClose={onClose} title="Historial de versiones" width={560}
      description="Las instantáneas automáticas se crean cada 10 minutos de edición; también puedes guardar versiones con nombre desde el menú Archivo.">
      {!versions ? (
        <div className="spinner" />
      ) : versions.length === 0 ? (
        <p className="muted">Todavía no hay versiones guardadas de este archivo.</p>
      ) : (
        <table className="table-simple">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Fecha</th>
              <th>Tamaño</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>{v.label}{v.auto && <span className="badge" style={{ marginLeft: 6 }}>auto</span>}</td>
                <td className="muted">{new Date(v.createdAt).toLocaleString('es')}</td>
                <td className="muted">{formatBytes(v.size)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Button
                    size="sm"
                    icon={RotateCcw}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Restaurar versión',
                        message: `El documento volverá a «${v.label}». El estado actual se guardará antes en el historial.`,
                        confirmLabel: 'Restaurar',
                      });
                      if (!ok) return;
                      try {
                        await ctx.flush();
                        await repository.restoreVersion(v.id);
                        onClose();
                        await ctx.reload();
                        toast.success('Versión restaurada.');
                      } catch (e) {
                        reportError(e, 'No se pudo restaurar');
                      }
                    }}
                  >
                    Restaurar
                  </Button>{' '}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Eliminar versión ${v.label}`}
                    title="Eliminar versión"
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Eliminar versión', message: `¿Eliminar «${v.label}» del historial?`, danger: true, confirmLabel: 'Eliminar' })) {
                        await repository.deleteVersion(v.id);
                        refresh();
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}
