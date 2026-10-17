import { useCallback, useEffect, useState } from 'react';
import { repository } from '@/core/storage/repository';
import { onStorageEvent } from '@/core/storage/events';
import type { FileMeta, Folder } from '@/core/storage/types';

/** Lista reactiva de archivos y carpetas (se actualiza con los cambios de cualquier pestaña). */
export function useFiles(opts: { trashed?: boolean } = {}) {
  const [files, setFiles] = useState<FileMeta[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<unknown>(null);
  const trashed = opts.trashed ?? false;

  const reload = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([repository.listFiles({ trashed }), repository.listFolders()]);
      setFiles(f);
      setFolders(d);
    } catch (e) {
      setError(e);
    }
  }, [trashed]);

  useEffect(() => {
    void reload();
    return onStorageEvent(() => void reload());
  }, [reload]);

  return { files, folders, error, reload };
}
