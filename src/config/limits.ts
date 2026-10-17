/** Límites de seguridad para la importación. Pueden ajustarse desde Ajustes (se guardan en el almacén `meta`). */
export interface ImportLimits {
  /** Tamaño máximo del archivo importado, en bytes. */
  maxFileBytes: number;
  /** Número máximo de entradas en un ZIP (DOCX/XLSX/PPTX/ODT/ODS). */
  maxZipEntries: number;
  /** Tamaño total descomprimido máximo de un ZIP, en bytes. */
  maxZipUncompressedBytes: number;
  /** Relación máxima descomprimido/comprimido por entrada (detección de zip bombs). */
  maxCompressionRatio: number;
}

export const DEFAULT_LIMITS: ImportLimits = {
  maxFileBytes: 100 * 1024 * 1024,
  maxZipEntries: 10000,
  maxZipUncompressedBytes: 500 * 1024 * 1024,
  maxCompressionRatio: 200,
};

let current: ImportLimits = { ...DEFAULT_LIMITS };

export function getLimits(): ImportLimits {
  return current;
}

export function setLimits(next: Partial<ImportLimits>): void {
  current = { ...current, ...next };
}
