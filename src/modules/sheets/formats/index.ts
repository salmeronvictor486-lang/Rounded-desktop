import { FileFormatError } from '@/core/files/errors';
import { detectContainer } from '@/core/files/signature';
import { extensionOf, stripExtension } from '@/core/util/format';
import type { ImportResult } from '@/app/types';
import type { Workbook } from '../model';

export const SHEETS_IMPORT_EXTENSIONS = ['xlsx', 'xlsm', 'xltx', 'ods', 'ots', 'csv', 'tsv'];

export async function importSheetsFile(name: string, bytes: Uint8Array): Promise<ImportResult<Workbook>> {
  const ext = extensionOf(name);
  const base = stripExtension(name);
  const container = detectContainer(bytes);
  if (['xlsx', 'xlsm', 'xltx'].includes(ext)) {
    if (container !== 'zip') throw new FileFormatError(container === 'ole' ? 'Es un libro .xls antiguo con extensión .xlsx. Conviértelo con LibreOffice.' : 'El archivo no es un XLSX válido.');
    const { importXlsx } = await import('./xlsx');
    const r = await importXlsx(bytes);
    return { name: base, content: r.wb, warnings: r.warnings };
  }
  if (ext === 'ods' || ext === 'ots') {
    if (container !== 'zip') throw new FileFormatError('El archivo no es un ODS válido.');
    const { importOds } = await import('./ods');
    const r = await importOds(bytes);
    return { name: base, content: r.wb, warnings: r.warnings };
  }
  const { importCsv } = await import('./csv');
  const r = importCsv(bytes, base, ext === 'tsv' ? { delimiter: '\t' } : undefined);
  const warnings = r.encoding === 'windows-1252' ? ['El archivo no estaba en UTF-8: se ha leído como Windows-1252 (Europa occidental).'] : [];
  return { name: base, content: r.wb, warnings };
}

export interface SheetsExport {
  id: string;
  label: string;
  extension: string;
  /** Solo exporta la hoja activa. */
  perSheet?: boolean;
  run(wb: Workbook, title: string): Promise<{ blob: Blob; warnings: string[] }>;
}

export const SHEETS_EXPORTS: SheetsExport[] = [
  { id: 'xlsx', label: 'Libro de Excel (.xlsx)', extension: 'xlsx', run: async (wb) => (await import('./xlsx')).exportXlsx(wb) },
  { id: 'ods', label: 'OpenDocument (.ods)', extension: 'ods', run: async (wb) => (await import('./ods')).exportOds(wb) },
  {
    id: 'csv',
    label: 'CSV, separado por comas (hoja actual)',
    extension: 'csv',
    perSheet: true,
    run: async (wb) => ({ blob: (await import('./csv')).exportCsv(wb, wb.sheets[wb.activeSheet], { delimiter: ',', bom: false }), warnings: [] }),
  },
  {
    id: 'csv-es',
    label: 'CSV para Excel en español (punto y coma)',
    extension: 'csv',
    perSheet: true,
    run: async (wb) => ({ blob: (await import('./csv')).exportCsv(wb, wb.sheets[wb.activeSheet], { delimiter: ';', bom: true }), warnings: [] }),
  },
  {
    id: 'tsv',
    label: 'Valores separados por tabulaciones (.tsv)',
    extension: 'tsv',
    perSheet: true,
    run: async (wb) => ({ blob: (await import('./csv')).exportCsv(wb, wb.sheets[wb.activeSheet], { delimiter: '\t', bom: false }), warnings: [] }),
  },
];
