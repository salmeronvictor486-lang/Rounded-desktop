import { lazy } from 'react';
import { FileText } from 'lucide-react';
import type { AppModule } from '@/app/types';
import { createEmptyDocument, type WriterContent } from './model';
import { WRITER_EXPORTS, WRITER_IMPORT_EXTENSIONS, importWriterFile } from './formats';

export const writerModule: AppModule<WriterContent> = {
  kind: 'document',
  icon: FileText,
  accent: 'accent-scribe',
  importExtensions: WRITER_IMPORT_EXTENSIONS,
  createEmpty: () => createEmptyDocument(),
  importFile: (file, bytes) => importWriterFile(file.name, bytes),
  exports: WRITER_EXPORTS.map((x) => ({ id: x.id, label: x.label, extension: x.extension, run: (c, f) => x.run(c, f.name) })),
  Editor: lazy(() => import('./WriterEditor')),
  Preview: lazy(() => import('./Preview')),
};
