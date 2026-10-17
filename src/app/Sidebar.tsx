import { FolderOpen, Home, LayoutTemplate, Settings, Trash2 } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { Logo } from './Logo';
import { MODULES } from './registry';
import type { Route } from './router';

export function Sidebar({ route, open, onNavigate }: { route: Route; open: boolean; onNavigate: () => void }) {
  const isFiles = (kind: string | null) => route.name === 'files' && route.kind === kind && !route.folderId;
  const link = (href: string, current: boolean, label: string, icon: React.ReactNode, cls = '') => (
    <a href={`#${href}`} className={`nav-link ${cls}`} aria-current={current ? 'page' : undefined} onClick={onNavigate}>
      {icon}
      <span>{label}</span>
    </a>
  );
  return (
    <nav className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Navegación principal">
      <a href="#/" className="brand" onClick={onNavigate}>
        <Logo className="brand-logo" />
        <span>
          <div className="brand-name">{BRAND.suiteName}</div>
          <div className="brand-sub">Gratis · Local · Privado</div>
        </span>
      </a>
      {link('/', route.name === 'home', 'Inicio', <Home size={18} />)}
      {link('/files', route.name === 'files' && !route.kind, 'Mis archivos', <FolderOpen size={18} />)}
      {link('/templates', route.name === 'templates', 'Plantillas', <LayoutTemplate size={18} />)}
      <div className="nav-section">Aplicaciones</div>
      {MODULES.map((m) => {
        const Icon = m.icon;
        return (
          <a
            key={m.kind}
            href={`#/files?kind=${m.kind}`}
            className={`nav-link ${m.accent}`}
            aria-current={isFiles(m.kind) ? 'page' : undefined}
            onClick={onNavigate}
          >
            <span className="app-dot" aria-hidden="true">
              <Icon size={14} />
            </span>
            <span>{BRAND.apps[m.kind].name}</span>
          </a>
        );
      })}
      <div className="sidebar-footer">
        {link('/trash', route.name === 'trash', 'Papelera', <Trash2 size={18} />)}
        {link('/settings', route.name === 'settings', 'Ajustes', <Settings size={18} />)}
      </div>
    </nav>
  );
}
