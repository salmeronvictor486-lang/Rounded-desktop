import { useMemo } from 'react';
import { ChevronRight, FolderPlus, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { pickFiles } from '@/core/files/download';
import { repository } from '@/core/storage/repository';
import type { FileKind, Folder } from '@/core/storage/types';
import { Button } from '@/ui/Button';
import { MenuButton, type MenuItem } from '@/ui/Menu';
import { confirmDialog, promptDialog } from '@/ui/dialogs';
import { reportError } from '@/ui/toast';
import { FileList } from './FileList';
import { createNewFile, importFiles } from './fileActions';
import { ALL_IMPORT_ACCEPT, MODULES, moduleFor } from './registry';
import { navigate } from './router';
import { useFiles } from './useFiles';

function buildUrl(p: { folderId?: string | null; kind?: string | null; query?: string }) {
  const q = new URLSearchParams();
  if (p.folderId) q.set('folder', p.folderId);
  if (p.kind) q.set('kind', p.kind);
  if (p.query) q.set('q', p.query);
  const s = q.toString();
  return `/files${s ? `?${s}` : ''}`;
}

export function FilesPage({ folderId, kind, query }: { folderId: string | null; kind: string | null; query: string }) {
  const { files, folders } = useFiles();
  const kindFilter = (MODULES.some((m) => m.kind === kind) ? kind : null) as FileKind | null;

  const crumbs = useMemo(() => {
    const out: Folder[] = [];
    let cur = folders.find((f) => f.id === folderId);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      out.unshift(cur);
      cur = folders.find((f) => f.id === cur!.parentId);
    }
    return out;
  }, [folders, folderId]);

  const q = query.trim().toLowerCase();
  const visibleFiles = (files ?? []).filter((f) => {
    if (kindFilter && f.kind !== kindFilter) return false;
    if (q) return f.name.toLowerCase().includes(q);
    // Sin búsqueda ni filtro por tipo se navega por carpetas.
    if (!kindFilter) return f.folderId === folderId;
    return true;
  });
  const visibleFolders = q || kindFilter ? [] : folders.filter((f) => f.parentId === folderId);

  const title = kindFilter ? BRAND.apps[kindFilter].name : crumbs.length ? crumbs[crumbs.length - 1].name : 'Mis archivos';

  const folderMenu = (f: Folder): MenuItem[] => [
    { label: 'Abrir', onSelect: () => navigate(buildUrl({ folderId: f.id })) },
    {
      label: 'Cambiar nombre…',
      icon: Pencil,
      onSelect: async () => {
        const name = await promptDialog({ title: 'Cambiar nombre de la carpeta', defaultValue: f.name });
        if (name) await repository.renameFolder(f.id, name);
      },
    },
    { type: 'separator' },
    {
      label: 'Eliminar carpeta',
      icon: Trash2,
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: 'Eliminar carpeta',
          message: `Se eliminará la carpeta «${f.name}». Su contenido no se borra: pasa a la carpeta superior.`,
          confirmLabel: 'Eliminar carpeta',
          danger: true,
        });
        if (ok) await repository.deleteFolder(f.id);
      },
    },
  ];

  const newItems: MenuItem[] = MODULES.filter((m) => m.kind !== 'pdf').map((m) => ({
    label: `${BRAND.apps[m.kind].noun} (${BRAND.apps[m.kind].short})`,
    icon: m.icon,
    onSelect: () => void createNewFile(m.kind, { folderId }).catch((e) => reportError(e)),
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          {kindFilter && <p className="page-sub">{BRAND.apps[kindFilter].description}</p>}
        </div>
        <div className="spacer" />
        {kindFilter && kindFilter !== 'pdf' ? (
          <Button variant="primary" icon={Plus} onClick={() => void createNewFile(kindFilter).catch((e) => reportError(e))}>
            Nuevo
          </Button>
        ) : !kindFilter ? (
          <MenuButton items={newItems} className="btn btn-primary" label="Nuevo archivo">
            <Plus size={17} /> <span>Nuevo</span>
          </MenuButton>
        ) : null}
        <Button
          icon={Upload}
          onClick={async () => {
            const accept = kindFilter ? moduleFor(kindFilter).importExtensions.map((e) => `.${e}`).join(',') : ALL_IMPORT_ACCEPT;
            const picked = await pickFiles(accept, true);
            if (picked.length) await importFiles(picked, kindFilter ? null : folderId);
          }}
        >
          Importar
        </Button>
        {!kindFilter && (
          <Button
            icon={FolderPlus}
            onClick={async () => {
              const name = await promptDialog({ title: 'Nueva carpeta', message: 'Nombre de la carpeta', defaultValue: 'Nueva carpeta', confirmLabel: 'Crear' });
              if (name) await repository.createFolder(name, folderId);
            }}
          >
            Carpeta
          </Button>
        )}
      </div>

      <div className="file-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            className="input"
            type="search"
            placeholder="Buscar archivos por nombre…"
            aria-label="Buscar archivos"
            defaultValue={query}
            onChange={(e) => navigate(buildUrl({ folderId, kind: kindFilter, query: e.target.value }), true)}
          />
        </div>
        <div className="chip-row" style={{ margin: 0 }} role="group" aria-label="Filtrar por tipo">
          <button type="button" className="chip" aria-pressed={!kindFilter} onClick={() => navigate(buildUrl({ query }))}>
            Todos
          </button>
          {MODULES.map((m) => (
            <button key={m.kind} type="button" className="chip" aria-pressed={kindFilter === m.kind} onClick={() => navigate(buildUrl({ kind: m.kind, query }))}>
              {BRAND.apps[m.kind].short}
            </button>
          ))}
        </div>
      </div>

      {!kindFilter && !q && (
        <nav className="breadcrumbs" aria-label="Ruta de carpetas">
          <button type="button" onClick={() => navigate(buildUrl({}))}>Mis archivos</button>
          {crumbs.map((c) => (
            <span key={c.id} className="row" style={{ gap: 4 }}>
              <ChevronRight size={14} />
              <button type="button" onClick={() => navigate(buildUrl({ folderId: c.id }))}>{c.name}</button>
            </span>
          ))}
        </nav>
      )}

      {files === null ? (
        <div className="center-fill" style={{ height: 200 }}><div className="spinner" /></div>
      ) : (
        <FileList
          files={visibleFiles}
          folders={folders}
          showFolders={visibleFolders}
          onOpenFolder={(id) => navigate(buildUrl({ folderId: id }))}
          folderMenu={folderMenu}
          emptyMessage={q ? 'Ningún archivo coincide con la búsqueda.' : 'Esta carpeta está vacía.'}
        />
      )}
    </div>
  );
}
