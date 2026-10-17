import { Upload } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { pickFiles } from '@/core/files/download';
import { formatRelativeTime } from '@/core/util/format';
import { Button } from '@/ui/Button';
import { reportError } from '@/ui/toast';
import { MODULES } from './registry';
import { createNewFile, importFiles } from './fileActions';
import { FileList, FileTypeIcon } from './FileList';
import { editPath, navigate } from './router';
import { useFiles } from './useFiles';
import { ALL_IMPORT_ACCEPT } from './registry';

export function HomePage() {
  const { files, folders } = useFiles();
  const recent = (files ?? [])
    .slice()
    .sort((a, b) => Math.max(b.openedAt ?? 0, b.updatedAt) - Math.max(a.openedAt ?? 0, a.updatedAt))
    .slice(0, 8);
  const starred = (files ?? []).filter((f) => f.starred);

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>Bienvenido a {BRAND.suiteName}</h1>
          <p className="page-sub">{BRAND.tagline} Todo se guarda en este dispositivo.</p>
        </div>
        <div className="spacer" />
        <Button
          icon={Upload}
          onClick={async () => {
            const picked = await pickFiles(ALL_IMPORT_ACCEPT, true);
            if (picked.length) await importFiles(picked);
          }}
        >
          Importar archivo
        </Button>
      </div>

      <section className="section" aria-labelledby="create-title">
        <div className="section-header">
          <h2 id="create-title">Crear</h2>
          <div className="spacer" />
          <a href="#/templates" className="btn btn-ghost btn-sm">Ver plantillas</a>
        </div>
        <div className="quick-create">
          {MODULES.map((m) => {
            const Icon = m.icon;
            const app = BRAND.apps[m.kind];
            const isPdf = m.kind === 'pdf';
            return (
              <button
                key={m.kind}
                type="button"
                className={`create-card ${m.accent}`}
                onClick={async () => {
                  try {
                    if (isPdf) {
                      const picked = await pickFiles('.pdf,application/pdf', true);
                      if (picked.length) await importFiles(picked);
                    } else {
                      await createNewFile(m.kind);
                    }
                  } catch (e) {
                    reportError(e, 'No se pudo crear el archivo');
                  }
                }}
              >
                <span className="app-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span className="title">{isPdf ? `Abrir PDF en ${app.name}` : `Nuevo: ${app.noun.toLowerCase()}`}</span>
                <span className="desc">
                  {app.name} · {app.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="section" aria-labelledby="recent-title">
          <div className="section-header">
            <h2 id="recent-title">Recientes</h2>
            <div className="spacer" />
            <a href="#/files" className="btn btn-ghost btn-sm">Todos los archivos</a>
          </div>
          <div className="recent-grid">
            {recent.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`recent-card ${MODULES.find((m) => m.kind === f.kind)?.accent}`}
                onClick={() => navigate(editPath(f.id))}
              >
                <div className="recent-thumb">
                  <FileTypeIcon file={f} size={26} />
                </div>
                <div className="recent-info">
                  <span className="name">{f.name}</span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {BRAND.apps[f.kind].short} · {formatRelativeTime(f.updatedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {starred.length > 0 && (
        <section className="section" aria-labelledby="starred-title">
          <div className="section-header">
            <h2 id="starred-title">Destacados</h2>
          </div>
          <FileList files={starred} folders={folders} />
        </section>
      )}

      {files && files.length === 0 && (
        <div className="empty-state">
          <p>Aún no tienes archivos. Crea uno nuevo, elige una plantilla o arrastra un archivo a esta ventana.</p>
        </div>
      )}
    </div>
  );
}
