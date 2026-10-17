import { useEffect, useState } from 'react';
import { Menu as MenuIcon } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { DialogHost } from '@/ui/dialogs';
import { ToastHost } from '@/ui/toast';
import { EditorHost } from './EditorHost';
import { ErrorBoundary } from './ErrorBoundary';
import { FilesPage } from './FilesPage';
import { HomePage } from './Home';
import { Logo } from './Logo';
import { SettingsPage } from './SettingsPage';
import { Sidebar } from './Sidebar';
import { TemplatesPage } from './TemplatesPage';
import { TrashPage } from './TrashPage';
import { importFiles } from './fileActions';
import { useRoute } from './router';

function useFileDrop(enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [enabled]);
  return dragging;
}

export function App() {
  const route = useRoute();
  const [navOpen, setNavOpen] = useState(false);
  const inEditor = route.name === 'edit';
  const dragging = useFileDrop(!inEditor);

  useEffect(() => {
    if (!inEditor) document.title = BRAND.suiteName;
  }, [inEditor]);

  let content: React.ReactNode;
  switch (route.name) {
    case 'home':
      content = <HomePage />;
      break;
    case 'files':
      content = <FilesPage key={`${route.folderId}:${route.kind}`} folderId={route.folderId} kind={route.kind} query={route.query} />;
      break;
    case 'templates':
      content = <TemplatesPage kind={route.kind} />;
      break;
    case 'trash':
      content = <TrashPage />;
      break;
    case 'settings':
      content = <SettingsPage />;
      break;
    case 'edit':
      content = <EditorHost key={route.id} id={route.id} />;
      break;
    default:
      content = (
        <div className="center-fill">
          <h2>Página no encontrada</h2>
          <a className="btn" href="#/">Ir al inicio</a>
        </div>
      );
  }

  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Saltar al contenido
      </a>
      {inEditor ? (
        <main id="main" tabIndex={-1} style={{ height: '100%', outline: 'none' }}>
          <ErrorBoundary>{content}</ErrorBoundary>
        </main>
      ) : (
        <div className="app-shell">
          <div className="mobile-topbar">
            <button type="button" className="icon-btn" aria-label="Abrir navegación" onClick={() => setNavOpen(true)}>
              <MenuIcon size={20} />
            </button>
            <Logo size={26} />
            <strong>{BRAND.suiteName}</strong>
          </div>
          <Sidebar route={route} open={navOpen} onNavigate={() => setNavOpen(false)} />
          <main id="main" className="main" tabIndex={-1} onClick={() => navOpen && setNavOpen(false)}>
            <ErrorBoundary>{content}</ErrorBoundary>
          </main>
        </div>
      )}
      {dragging && <div className="drop-overlay">Suelta los archivos para importarlos</div>}
      <DialogHost />
      <ToastHost />
    </>
  );
}
