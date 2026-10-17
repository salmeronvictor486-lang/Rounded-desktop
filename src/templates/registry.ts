import type { FileKind } from '@/core/storage/types';
import type { TemplateDef } from './types';

/**
 * Las plantillas se descubren automáticamente: cualquier archivo
 * `src/templates/<carpeta>/*.tpl.ts` que exporte `template` (o `templates`)
 * se registra sin modificar el núcleo de la aplicación.
 */
const modules = import.meta.glob<{ template?: TemplateDef; templates?: TemplateDef[] }>('./**/*.tpl.ts', { eager: true });

const ALL: TemplateDef[] = Object.values(modules)
  .flatMap((m) => [...(m.template ? [m.template] : []), ...(m.templates ?? [])])
  .sort((a, b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'));

export function listTemplates(kind?: FileKind | null): TemplateDef[] {
  return kind ? ALL.filter((t) => t.kind === kind) : ALL;
}

export function getTemplate(id: string): TemplateDef | undefined {
  return ALL.find((t) => t.id === id);
}

export function templateCategories(kind?: FileKind | null): string[] {
  return Array.from(new Set(listTemplates(kind).map((t) => t.category)));
}
