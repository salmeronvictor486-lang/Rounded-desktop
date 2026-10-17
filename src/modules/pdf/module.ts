import { lazy } from 'react';
import { FileType2 } from 'lucide-react';
import type { AppModule } from '@/app/types';
import { FileFormatError } from '@/core/files/errors';
import { detectContainer } from '@/core/files/signature';
import { stripExtension } from '@/core/util/format';
import { createFolio, normalizeFolio, type FolioContent } from './model';

export const pdfModule: AppModule<FolioContent> = {
  kind: 'pdf',
  icon: FileType2,
  accent: 'accent-folio',
  importExtensions: ['pdf'],
  createEmpty: () => createFolio(),
  importFile: async (file, bytes) => {
    if (detectContainer(bytes) !== 'pdf') throw new FileFormatError('El archivo no es un PDF válido.');
    const warnings: string[] = [];
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
    if (/\/JavaScript|\/JS\s*[(<]/.test(head)) warnings.push('El PDF contiene JavaScript: no se ejecuta nunca en Rounded Folio.');
    if (/\/EmbeddedFile/.test(head)) warnings.push('El PDF contiene archivos adjuntos incrustados: no se extraen automáticamente.');
    return { name: stripExtension(file.name), content: createFolio(bytes), warnings };
  },
  exports: [
    {
      id: 'pdf',
      label: 'PDF con anotaciones',
      extension: 'pdf',
      run: async (c) => {
        const { flattenAnnotations } = await import('./ops');
        const bytes = await flattenAnnotations(normalizeFolio(c));
        return new Blob([bytes as BlobPart], { type: 'application/pdf' });
      },
    },
    { id: 'pdf-original', label: 'PDF original', extension: 'pdf', run: async (c) => new Blob([normalizeFolio(c).bytes as BlobPart], { type: 'application/pdf' }) },
  ],
  Editor: lazy(() => import('./PdfEditor')),
  Preview: lazy(() => import('./Preview')),
};
