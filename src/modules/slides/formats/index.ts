import { FileFormatError } from '@/core/files/errors';
import { detectContainer } from '@/core/files/signature';
import { extensionOf, stripExtension } from '@/core/util/format';
import type { ImportResult } from '@/app/types';
import type { Presentation } from '../model';

export const SLIDES_IMPORT_EXTENSIONS = ['pptx', 'pptm', 'potx', 'ppsx'];

export async function importSlidesFile(name: string, bytes: Uint8Array): Promise<ImportResult<Presentation>> {
  const ext = extensionOf(name);
  if (detectContainer(bytes) !== 'zip') {
    throw new FileFormatError(detectContainer(bytes) === 'ole' ? `Es una presentación .ppt antigua con extensión .${ext}. Conviértela con LibreOffice.` : 'El archivo no es un PPTX válido.');
  }
  const { importPptx } = await import('./pptxImport');
  const r = await importPptx(bytes);
  return { name: stripExtension(name), content: r.content, warnings: r.warnings };
}

export interface SlidesExport {
  id: string;
  label: string;
  extension: string;
  run(p: Presentation, title: string): Promise<{ blob: Blob; warnings: string[] }>;
}

export const SLIDES_EXPORTS: SlidesExport[] = [
  { id: 'pptx', label: 'Presentación de PowerPoint (.pptx)', extension: 'pptx', run: async (p, t) => (await import('./pptxExport')).exportPptx(p, t) },
  { id: 'png-zip', label: 'Imágenes PNG de todas las diapositivas (.zip)', extension: 'zip', run: async (p) => ({ blob: await (await import('../exportImages')).exportAllPng(p), warnings: [] }) },
];
