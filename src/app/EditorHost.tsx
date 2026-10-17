import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AutosaveController, type SaveStatus } from '@/core/storage/autosave';
import { onStorageEvent, TAB_ID } from '@/core/storage/events';
import { repository } from '@/core/storage/repository';
import type { FileMeta } from '@/core/storage/types';
import { reportError } from '@/ui/toast';
import { ErrorBoundary } from './ErrorBoundary';
import { moduleFor } from './registry';
import type { EditorSession } from './types';

interface EditorContextValue {
  file: FileMeta;
  status: SaveStatus;
  externalChange: boolean;
  rename(name: string): Promise<void>;
  flush(): Promise<void>;
  /** Vuelve a cargar el contenido guardado (descarta cambios locales no guardados). */
  reload(): Promise<void>;
  overwrite(): Promise<void>;
  saveAsCopy(): Promise<FileMeta | null>;
  serialize(): unknown;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorContext fuera de EditorHost');
  return ctx;
}

interface Loaded {
  meta: FileMeta;
  content: unknown;
  key: number;
}

export function EditorHost({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [file, setFile] = useState<FileMeta | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const controller = useRef<AutosaveController<unknown> | null>(null);
  const serializer = useRef<() => unknown>(() => loaded?.content);
  const keyRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const meta = await repository.getFile(id);
      if (!meta || meta.trashed) {
        setError(meta?.trashed ? 'Este archivo está en la papelera.' : 'El archivo no existe.');
        return;
      }
      const content = await repository.loadContent(id);
      keyRef.current++;
      controller.current?.dispose();
      controller.current = new AutosaveController<unknown>(id, meta.revision, () => serializer.current(), {
        onStatus: (s, err) => {
          setStatus(s);
          if (s === 'error') reportError(err, 'No se pudo guardar');
        },
        onSaved: (m) => setFile(m),
      });
      setFile(meta);
      setStatus('saved');
      setExternalChange(false);
      setLoaded({ meta, content, key: keyRef.current });
      void repository.markOpened(id).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    setLoaded(null);
    setError(null);
    void load();
    return () => {
      const c = controller.current;
      if (c?.hasPendingChanges()) void c.flush();
      c?.dispose();
    };
  }, [load]);

  // Cambios desde otras pestañas.
  useEffect(
    () =>
      onStorageEvent((e) => {
        if (e.origin === TAB_ID || e.id !== id) return;
        if (e.type === 'saved' && controller.current && e.revision > controller.current.currentRevision) setExternalChange(true);
        if (e.type === 'changed') void repository.getFile(id).then((m) => m && setFile(m));
      }),
    [id],
  );

  // Guardar al ocultar la pestaña o cerrar la ventana.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void controller.current?.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (controller.current?.hasPendingChanges()) {
        void controller.current.flush();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  const session: EditorSession<unknown> | null = useMemo(() => {
    if (!loaded) return null;
    return {
      file: loaded.meta,
      initialContent: loaded.content,
      setSerializer: (fn) => {
        serializer.current = fn;
      },
      markDirty: () => controller.current?.markDirty(),
      flush: () => controller.current?.flush() ?? Promise.resolve(),
      rename: async (name) => {
        setFile(await repository.rename(id, name));
      },
    };
  }, [loaded, id]);

  const ctx: EditorContextValue | null = useMemo(() => {
    if (!file || !session) return null;
    return {
      file,
      status,
      externalChange,
      rename: session.rename,
      flush: session.flush,
      reload: load,
      overwrite: async () => {
        await controller.current?.overwrite();
        setExternalChange(false);
      },
      saveAsCopy: async () => {
        try {
          const meta = await repository.createFile({
            name: `${file.name} (mi versión)`,
            kind: file.kind,
            content: serializer.current(),
            folderId: file.folderId,
          });
          return meta;
        } catch (e) {
          reportError(e);
          return null;
        }
      },
      serialize: () => serializer.current(),
    };
  }, [file, session, status, externalChange, load]);

  if (error) {
    return (
      <div className="center-fill" role="alert">
        <h2>No se puede abrir el archivo</h2>
        <p className="muted">{error}</p>
        <a className="btn" href="#/">Volver al inicio</a>
      </div>
    );
  }
  if (!loaded || !session || !ctx) {
    return (
      <div className="center-fill" aria-busy="true">
        <div className="spinner" />
        <span className="muted">Abriendo…</span>
      </div>
    );
  }
  const mod = moduleFor(loaded.meta.kind);
  const Editor = mod.Editor;
  return (
    <EditorContext.Provider value={ctx}>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="center-fill" aria-busy="true">
              <div className="spinner" />
              <span className="muted">Cargando editor…</span>
            </div>
          }
        >
          <Editor key={loaded.key} session={session} />
        </Suspense>
      </ErrorBoundary>
    </EditorContext.Provider>
  );
}
