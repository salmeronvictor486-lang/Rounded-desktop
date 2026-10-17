import { lazy } from 'react';
import { Presentation as PresentationIcon } from 'lucide-react';
import type { AppModule } from '@/app/types';
import type { Presentation } from './model';
import { createPresentation } from './model.create';
import { SLIDES_EXPORTS, SLIDES_IMPORT_EXTENSIONS, importSlidesFile } from './formats';

export const slidesModule: AppModule<Presentation> = {
  kind: 'presentation',
  icon: PresentationIcon,
  accent: 'accent-stage',
  importExtensions: SLIDES_IMPORT_EXTENSIONS,
  createEmpty: () => createPresentation(),
  importFile: (file, bytes) => importSlidesFile(file.name, bytes),
  exports: SLIDES_EXPORTS.map((x) => ({ id: x.id, label: x.label, extension: x.extension, run: async (c, f) => (await x.run(c, f.name)).blob })),
  Editor: lazy(() => import('./SlidesEditor')),
  Preview: lazy(() => import('./Preview')),
};
