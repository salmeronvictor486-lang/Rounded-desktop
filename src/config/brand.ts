/**
 * Identidad de producto. Cambiar estos valores renombra la suite y sus
 * aplicaciones en toda la interfaz, el manifiesto PWA y los metadatos de los
 * archivos exportados.
 */
export const BRAND = {
  suiteName: 'Rounded Desktop',
  shortName: 'Rounded',
  tagline: 'Suite ofimática gratuita: documentos, hojas de cálculo, presentaciones y PDF.',
  apps: {
    document: { name: 'Rounded Scribe', short: 'Scribe', noun: 'Documento', description: 'Procesador de textos' },
    spreadsheet: { name: 'Rounded Grid', short: 'Grid', noun: 'Hoja de cálculo', description: 'Hojas de cálculo' },
    presentation: { name: 'Rounded Stage', short: 'Stage', noun: 'Presentación', description: 'Presentaciones' },
    pdf: { name: 'Rounded Folio', short: 'Folio', noun: 'PDF', description: 'Visor y herramientas PDF' },
  },
} as const;

export type AppKind = keyof typeof BRAND.apps;
