import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Check, CloudOff, Copy, FilePlus2, History, Loader2, Menu as MenuIcon, Pencil, Save, Trash2 } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { repository } from '@/core/storage/repository';
import type { SaveStatus } from '@/core/storage/autosave';
import { Button } from '@/ui/Button';
import { MenuButton, type MenuItem } from '@/ui/Menu';
import { confirmDialog, promptDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import { useEditorContext } from './EditorHost';
import { createNewFile } from './fileActions';
import { moduleFor } from './registry';
import { editPath, navigate } from './router';
import { VersionsDialog } from './VersionsDialog';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Guardado',
  dirty: 'Cambios sin guardar',
  saving: 'Guardando…',
  error: 'Error al guardar',
  conflict: 'Conflicto',
};

export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const Icon = status === 'saved' ? Check : status === 'saving' ? Loader2 : status === 'dirty' ? Save : status === 'error' ? CloudOff : AlertTriangle;
  return (
    <span className={`save-status is-${status}`} role="status" aria-live="polite" data-testid="save-status" data-status={status}>
      <Icon size={14} aria-hidden="true" className={status === 'saving' ? 'spin' : undefined} />
      <span className="hide-mobile">{STATUS_TEXT[status]}</span>
    </span>
  );
}

export interface MenuDef {
  label: string;
  items: MenuItem[] | (() => MenuItem[]);
}

/** Elementos comunes del menú Archivo en todos los editores. */
export function useCommonFileItems(onOpenVersions: () => void): MenuItem[] {
  const ctx = useEditorContext();
  const kind = ctx.file.kind;
  return [
    {
      label: `Nuevo ${BRAND.apps[kind].noun.toLowerCase()}`,
      icon: FilePlus2,
      onSelect: () => void createNewFile(kind).catch((e) => reportError(e)),
    },
    {
      label: 'Cambiar nombre…',
      icon: Pencil,
      onSelect: async () => {
        const name = await promptDialog({ title: 'Cambiar nombre', defaultValue: ctx.file.name });
        if (name) await ctx.rename(name);
      },
    },
    {
      label: 'Crear una copia',
      icon: Copy,
      onSelect: async () => {
        await ctx.flush();
        const copy = await repository.duplicate(ctx.file.id);
        toast.success('Copia creada.');
        navigate(editPath(copy.id));
      },
    },
    { type: 'separator' },
    {
      label: 'Guardar versión con nombre…',
      icon: Save,
      onSelect: async () => {
        const label = await promptDialog({ title: 'Guardar versión', message: 'Nombre de la versión', defaultValue: new Date().toLocaleString('es') });
        if (!label) return;
        await ctx.flush();
        await repository.createVersion(ctx.file.id, label, false);
        toast.success('Versión guardada en el historial.');
      },
    },
    { label: 'Historial de versiones…', icon: History, onSelect: onOpenVersions },
    { type: 'separator' },
    {
      label: 'Mover a la papelera',
      icon: Trash2,
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: 'Mover a la papelera',
          message: `«${ctx.file.name}» se moverá a la papelera.`,
          confirmLabel: 'Mover a la papelera',
          danger: true,
        });
        if (!ok) return;
        await ctx.flush();
        await repository.trash(ctx.file.id);
        navigate('/');
      },
    },
  ];
}

interface ShellProps {
  menus: MenuDef[];
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  versionsOpen: boolean;
  onVersionsClose: () => void;
}

export function EditorShell({ menus, actions, toolbar, children, versionsOpen, onVersionsClose }: ShellProps) {
  const ctx = useEditorContext();
  const mod = moduleFor(ctx.file.kind);
  const Icon = mod.icon;
  const [title, setTitle] = useState(ctx.file.name);
  useEffect(() => setTitle(ctx.file.name), [ctx.file.name]);

  useEffect(() => {
    document.title = `${ctx.file.name} — ${BRAND.apps[ctx.file.kind].name}`;
    return () => {
      document.title = BRAND.suiteName;
    };
  }, [ctx.file.name, ctx.file.kind]);

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== ctx.file.name) void ctx.rename(t);
    else setTitle(ctx.file.name);
  };

  return (
    <div className={`editor-shell ${mod.accent}`}>
      <header className="editor-header">
        <a href="#/" className="icon-btn" aria-label="Volver al inicio" title="Volver al inicio" onClick={() => void ctx.flush()}>
          <ArrowLeft size={18} />
        </a>
        <span className="app-icon" title={BRAND.apps[ctx.file.kind].name}>
          <Icon size={19} aria-hidden="true" />
        </span>
        <div className="editor-title-block">
          <input
            className="title-input"
            value={title}
            aria-label="Nombre del archivo"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setTitle(ctx.file.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            size={Math.max(8, Math.min(40, title.length + 1))}
          />
          <nav className="menubar" aria-label="Menú del editor">
            {menus.map((m) => (
              <MenuButton key={m.label} items={m.items} className="menubar-btn" label={m.label}>
                {m.label}
              </MenuButton>
            ))}
          </nav>
        </div>
        {/* En pantallas estrechas la barra de menús se oculta y sus menús se agrupan aquí */}
        <MenuButton
          className="icon-btn mobile-menu-btn"
          label="Menú"
          items={() => menus.map((m) => ({ label: m.label, submenu: typeof m.items === 'function' ? m.items() : m.items }))}
        >
          <MenuIcon size={18} />
        </MenuButton>
        <SaveStatusIndicator status={ctx.status} />
        <div className="spacer" />
        {actions}
      </header>
      {(ctx.status === 'conflict' || ctx.externalChange) && (
        <div className="conflict-banner" role="alert">
          <AlertTriangle size={17} />
          <span>
            {ctx.status === 'conflict'
              ? 'Este archivo se ha guardado desde otra pestaña o ventana. Tus cambios recientes no se han guardado.'
              : 'Este archivo se ha modificado en otra pestaña.'}
          </span>
          <div className="spacer" />
          <Button size="sm" onClick={() => void ctx.reload()}>Cargar la versión guardada</Button>
          {ctx.status === 'conflict' && (
            <>
              <Button size="sm" onClick={async () => {
                const copy = await ctx.saveAsCopy();
                if (copy) {
                  toast.success('Tus cambios se han guardado como una copia.');
                  navigate(editPath(copy.id));
                }
              }}>
                Guardar mis cambios como copia
              </Button>
              <Button size="sm" variant="danger" onClick={() => void ctx.overwrite()}>Sobrescribir con mis cambios</Button>
            </>
          )}
        </div>
      )}
      {toolbar}
      <div className="editor-body">{children}</div>
      <VersionsDialog open={versionsOpen} onClose={onVersionsClose} />
    </div>
  );
}
