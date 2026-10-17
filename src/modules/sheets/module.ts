import { lazy } from 'react';
import { Sheet } from 'lucide-react';
import type { AppModule } from '@/app/types';
import { createWorkbook, type Workbook } from './model';
import { SHEETS_EXPORTS, SHEETS_IMPORT_EXTENSIONS, importSheetsFile } from './formats';

export const sheetsModule: AppModule<Workbook> = {
  kind: 'spreadsheet',
  icon: Sheet,
  accent: 'accent-grid',
  importExtensions: SHEETS_IMPORT_EXTENSIONS,
  createEmpty: () => createWorkbook(),
  importFile: (file, bytes) => importSheetsFile(file.name, bytes),
  exports: SHEETS_EXPORTS.map((x) => ({ id: x.id, label: x.label, extension: x.extension, run: async (c, f) => (await x.run(c, f.name)).blob })),
  Editor: lazy(() => import('./SheetsEditor')),
  Preview: lazy(() => import('./Preview')),
};
