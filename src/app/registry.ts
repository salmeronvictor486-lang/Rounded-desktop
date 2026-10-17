import type { FileKind } from '@/core/storage/types';
import type { AppModule } from './types';
import { writerModule } from '@/modules/writer/module';
import { sheetsModule } from '@/modules/sheets/module';
import { slidesModule } from '@/modules/slides/module';
import { pdfModule } from '@/modules/pdf/module';

/**
 * Registro de aplicaciones. Para añadir un módulo nuevo (p. ej. Rounded Forms)
 * basta con crear su AppModule y añadirlo aquí.
 */
export const MODULES: AppModule<any>[] = [writerModule, sheetsModule, slidesModule, pdfModule];

export function moduleFor(kind: FileKind): AppModule<any> {
  const m = MODULES.find((x) => x.kind === kind);
  if (!m) throw new Error(`Tipo de archivo desconocido: ${kind}`);
  return m;
}

export function moduleForExtension(ext: string): AppModule<any> | undefined {
  return MODULES.find((m) => m.importExtensions.includes(ext.toLowerCase()));
}

export const ALL_IMPORT_ACCEPT = MODULES.flatMap((m) => m.importExtensions.map((e) => `.${e}`)).join(',');
