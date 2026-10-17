import { Trash2 } from 'lucide-react';
import { repository } from '@/core/storage/repository';
import { Button } from '@/ui/Button';
import { confirmDialog } from '@/ui/dialogs';
import { toast } from '@/ui/toast';
import { FileList } from './FileList';
import { useFiles } from './useFiles';

export function TrashPage() {
  const { files, folders } = useFiles({ trashed: true });
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Papelera</h1>
          <p className="page-sub">Los archivos de la papelera se pueden restaurar o eliminar definitivamente.</p>
        </div>
        <div className="spacer" />
        <Button
          variant="danger"
          icon={Trash2}
          disabled={!files?.length}
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Vaciar papelera',
              message: `Se eliminarán definitivamente ${files?.length ?? 0} archivo(s) y su historial. No se puede deshacer.`,
              confirmLabel: 'Vaciar papelera',
              danger: true,
            });
            if (ok) toast.info(`${await repository.emptyTrash()} archivo(s) eliminados.`);
          }}
        >
          Vaciar papelera
        </Button>
      </div>
      {files && <FileList files={files} folders={folders} trashed emptyMessage="La papelera está vacía." />}
    </div>
  );
}
