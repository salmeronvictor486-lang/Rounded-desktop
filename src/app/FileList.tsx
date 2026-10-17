import { Copy, Download, ExternalLink, Folder as FolderIcon, FolderInput, MoreHorizontal, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { repository } from '@/core/storage/repository';
import type { FileMeta, Folder } from '@/core/storage/types';
import { formatBytes, formatRelativeTime } from '@/core/util/format';
import { useMenu, type MenuItem } from '@/ui/Menu';
import { reportError, toast } from '@/ui/toast';
import { moduleFor } from './registry';
import { editPath, navigate } from './router';
import { deleteForeverInteractive, exportFile, renameFileInteractive, trashFileInteractive } from './fileActions';

export function FileTypeIcon({ file, size = 16 }: { file: Pick<FileMeta, 'kind'>; size?: number }) {
  const mod = moduleFor(file.kind);
  const Icon = mod.icon;
  return (
    <span className={`file-icon ${mod.accent}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

export function fileMenuItems(file: FileMeta, folders: Folder[], opts: { trashed?: boolean } = {}): MenuItem[] {
  if (opts.trashed) {
    return [
      { label: 'Restaurar', icon: RotateCcw, onSelect: () => void repository.restore(file.id).then(() => toast.success('Archivo restaurado.')) },
      { type: 'separator' },
      { label: 'Eliminar definitivamente', icon: Trash2, danger: true, onSelect: () => void deleteForeverInteractive(file) },
    ];
  }
  const mod = moduleFor(file.kind);
  return [
    { label: 'Abrir', icon: ExternalLink, onSelect: () => navigate(editPath(file.id)) },
    { label: 'Cambiar nombre…', icon: Pencil, onSelect: () => void renameFileInteractive(file).catch((e) => reportError(e)) },
    {
      label: 'Duplicar',
      icon: Copy,
      onSelect: () => void repository.duplicate(file.id).then(() => toast.success('Copia creada.'), (e) => reportError(e)),
    },
    {
      label: file.starred ? 'Quitar de destacados' : 'Destacar',
      icon: Star,
      onSelect: () => void repository.updateMeta(file.id, { starred: !file.starred }),
    },
    {
      label: 'Mover a',
      icon: FolderInput,
      submenu: [
        { label: 'Mis archivos (raíz)', checked: file.folderId === null, onSelect: () => void repository.move(file.id, null) },
        ...folders.map((f) => ({ label: f.name, checked: file.folderId === f.id, onSelect: () => void repository.move(file.id, f.id) })),
      ],
    },
    {
      label: 'Descargar como',
      icon: Download,
      submenu: mod.exports.map((opt) => ({ label: opt.label, onSelect: () => void exportFile(file, opt) })),
    },
    { type: 'separator' },
    { label: 'Mover a la papelera', icon: Trash2, danger: true, onSelect: () => void trashFileInteractive(file) },
  ];
}

interface FileListProps {
  files: FileMeta[];
  folders?: Folder[];
  /** Carpetas a mostrar como filas (navegables). */
  showFolders?: Folder[];
  onOpenFolder?: (id: string) => void;
  folderMenu?: (f: Folder) => MenuItem[];
  trashed?: boolean;
  emptyMessage?: string;
}

export function FileList({ files, folders = [], showFolders = [], onOpenFolder, folderMenu, trashed, emptyMessage }: FileListProps) {
  const menu = useMenu();
  if (files.length === 0 && showFolders.length === 0) {
    return <div className="empty-state file-list">{emptyMessage ?? 'No hay archivos.'}</div>;
  }
  const open = (f: FileMeta) => (trashed ? undefined : navigate(editPath(f.id)));
  return (
    <div className="file-list" role="table" aria-label="Archivos">
      <div className="file-row is-header" role="row">
        <span role="columnheader">Nombre</span>
        <span role="columnheader" className="file-meta">{trashed ? 'Eliminado' : 'Modificado'}</span>
        <span role="columnheader" className="file-meta">Tamaño</span>
        <span role="columnheader"><span className="sr-only">Acciones</span></span>
      </div>
      {showFolders.map((folder) => (
        <div
          key={folder.id}
          className="file-row"
          role="row"
          onDoubleClick={() => onOpenFolder?.(folder.id)}
          onContextMenu={(e) => {
            if (!folderMenu) return;
            e.preventDefault();
            menu.openAt(folderMenu(folder), e.clientX, e.clientY, `Acciones de la carpeta ${folder.name}`);
          }}
        >
          <span className="file-name" role="cell">
            <span className="file-icon folder-icon" aria-hidden="true">
              <FolderIcon size={16} />
            </span>
            <button type="button" className="link" onClick={() => onOpenFolder?.(folder.id)}>
              {folder.name}
            </button>
          </span>
          <span className="file-meta" role="cell">Carpeta</span>
          <span className="file-meta" role="cell">—</span>
          <span role="cell">
            {folderMenu && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Acciones de la carpeta ${folder.name}`}
                title="Más acciones"
                onClick={(e) => menu.openFrom(folderMenu(folder), e.currentTarget, { alignRight: true })}
              >
                <MoreHorizontal size={17} />
              </button>
            )}
          </span>
        </div>
      ))}
      {files.map((file) => (
        <div
          key={file.id}
          className={`file-row ${moduleFor(file.kind).accent}`}
          role="row"
          onDoubleClick={() => open(file)}
          onContextMenu={(e) => {
            e.preventDefault();
            menu.openAt(fileMenuItems(file, folders, { trashed }), e.clientX, e.clientY, `Acciones de ${file.name}`);
          }}
        >
          <span className="file-name" role="cell">
            <FileTypeIcon file={file} />
            <button
              type="button"
              className="link"
              onClick={() => open(file)}
              title={`${file.name} — ${BRAND.apps[file.kind].name}`}
              onKeyDown={(e) => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  e.preventDefault();
                  menu.openFrom(fileMenuItems(file, folders, { trashed }), e.currentTarget);
                }
              }}
            >
              {file.name}
            </button>
            {file.starred && <Star size={13} className="faint" aria-label="Destacado" />}
          </span>
          <span className="file-meta" role="cell">
            {formatRelativeTime(trashed ? file.trashedAt ?? file.updatedAt : file.updatedAt)}
          </span>
          <span className="file-meta" role="cell">{formatBytes(file.size)}</span>
          <span role="cell">
            <button
              type="button"
              className="icon-btn"
              aria-label={`Acciones de ${file.name}`}
              title="Más acciones"
              onClick={(e) => menu.openFrom(fileMenuItems(file, folders, { trashed }), e.currentTarget, { alignRight: true })}
            >
              <MoreHorizontal size={17} />
            </button>
          </span>
        </div>
      ))}
      {menu.element}
    </div>
  );
}
