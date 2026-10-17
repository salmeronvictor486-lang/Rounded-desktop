import { Suspense, useMemo, useState } from 'react';
import { BRAND } from '@/config/brand';
import type { FileKind } from '@/core/storage/types';
import { listTemplates } from '@/templates/registry';
import type { TemplateDef } from '@/templates/types';
import { Button } from '@/ui/Button';
import { reportError } from '@/ui/toast';
import { createNewFile } from './fileActions';
import { MODULES, moduleFor } from './registry';
import { navigate } from './router';
import { ErrorBoundary } from './ErrorBoundary';

function TemplatePreview({ template }: { template: TemplateDef }) {
  const mod = moduleFor(template.kind);
  const Preview = mod.Preview;
  const content = useMemo(() => template.build(), [template]);
  return (
    <ErrorBoundary fallback={<span className="faint">Vista previa no disponible</span>}>
      <Suspense fallback={<div className="spinner" />}>
        <Preview content={content} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function TemplatesPage({ kind }: { kind: string | null }) {
  const kindFilter = (MODULES.some((m) => m.kind === kind) ? kind : null) as FileKind | null;
  const [category, setCategory] = useState<string | null>(null);
  const all = listTemplates(kindFilter);
  const categories = Array.from(new Set(all.map((t) => t.category)));
  const shown = category ? all.filter((t) => t.category === category) : all;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Plantillas</h1>
          <p className="page-sub">Documentos editables listos para personalizar. {all.length} plantillas disponibles.</p>
        </div>
      </div>
      <div className="chip-row" role="group" aria-label="Aplicación">
        <button type="button" className="chip" aria-pressed={!kindFilter} onClick={() => { setCategory(null); navigate('/templates'); }}>
          Todas
        </button>
        {MODULES.filter((m) => listTemplates(m.kind).length > 0).map((m) => (
          <button
            key={m.kind}
            type="button"
            className="chip"
            aria-pressed={kindFilter === m.kind}
            onClick={() => {
              setCategory(null);
              navigate(`/templates?kind=${m.kind}`);
            }}
          >
            {BRAND.apps[m.kind].name}
          </button>
        ))}
      </div>
      <div className="chip-row" role="group" aria-label="Categoría">
        <button type="button" className="chip" aria-pressed={!category} onClick={() => setCategory(null)}>
          Todas las categorías
        </button>
        {categories.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {shown.map((t) => (
          <article key={t.id} className={`template-card ${moduleFor(t.kind).accent}`} aria-labelledby={`tpl-${t.id}`}>
            <div className="template-preview" aria-hidden="true">
              <TemplatePreview template={t} />
            </div>
            <div className="template-info">
              <span className="badge">{BRAND.apps[t.kind].short} · {t.category}</span>
              <span className="name" id={`tpl-${t.id}`}>{t.name}</span>
              <span className="desc">{t.description}</span>
              <Button variant="primary" size="sm" onClick={() => void createNewFile(t.kind, { template: t }).catch((e) => reportError(e))}>
                Usar plantilla
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
