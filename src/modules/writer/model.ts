import type { JSONContent } from '@tiptap/core';

export type PaperSize = 'A4' | 'A5' | 'A3' | 'Letter' | 'Legal';

/** Dimensiones en milímetros (vertical). */
export const PAPER_SIZES: Record<PaperSize, { width: number; height: number; label: string }> = {
  A4: { width: 210, height: 297, label: 'A4 (210 × 297 mm)' },
  A5: { width: 148, height: 210, label: 'A5 (148 × 210 mm)' },
  A3: { width: 297, height: 420, label: 'A3 (297 × 420 mm)' },
  Letter: { width: 215.9, height: 279.4, label: 'Carta (8,5 × 11 in)' },
  Legal: { width: 215.9, height: 355.6, label: 'Oficio/Legal (8,5 × 14 in)' },
};

export type Align = 'left' | 'center' | 'right';

export interface HeaderFooter {
  /** Texto con marcadores {page} y {pages}. */
  text: string;
  align: Align;
}

export interface PageSettings {
  size: PaperSize;
  orientation: 'portrait' | 'landscape';
  /** Márgenes en mm. */
  margins: { top: number; right: number; bottom: number; left: number };
  columns: 1 | 2 | 3;
  columnGap: number;
  header: HeaderFooter;
  footer: HeaderFooter;
  /** No mostrar encabezado/pie en la primera página. */
  differentFirstPage: boolean;
}

/** Estilo de texto a nivel de documento (equivalente a los estilos de Word). */
export interface TextStyleDef {
  fontFamily?: string;
  /** Tamaño en puntos. */
  fontSize?: number;
  /** Color "#RRGGBB". */
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface DocumentStyles {
  body?: TextStyleDef & { lineHeight?: number; spaceAfter?: number };
  headings?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, TextStyleDef>>;
}

export interface WriterContent {
  format: 'rounded-scribe';
  version: 1;
  doc: JSONContent;
  page: PageSettings;
  styles?: DocumentStyles;
  /** Idioma del documento (corrector ortográfico, metadatos). */
  language?: string;
}

export const DEFAULT_PAGE: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25, right: 25, bottom: 25, left: 25 },
  columns: 1,
  columnGap: 10,
  header: { text: '', align: 'center' },
  footer: { text: '', align: 'center' },
  differentFirstPage: false,
};

export function createEmptyDocument(doc?: JSONContent, page: Partial<PageSettings> = {}): WriterContent {
  return {
    format: 'rounded-scribe',
    version: 1,
    doc: doc ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    page: { ...structuredClone(DEFAULT_PAGE), ...page },
  };
}

export function pageDimensions(page: PageSettings): { width: number; height: number } {
  const p = PAPER_SIZES[page.size] ?? PAPER_SIZES.A4;
  return page.orientation === 'landscape' ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/** Normaliza contenido posiblemente antiguo o incompleto. */
export function normalizeWriterContent(c: Partial<WriterContent> | undefined | null): WriterContent {
  const base = createEmptyDocument();
  if (!c || typeof c !== 'object') return base;
  return {
    ...base,
    ...c,
    doc: c.doc && c.doc.type === 'doc' ? c.doc : base.doc,
    page: {
      ...base.page,
      ...(c.page ?? {}),
      margins: { ...base.page.margins, ...(c.page?.margins ?? {}) },
      header: { ...base.page.header, ...(c.page?.header ?? {}) },
      footer: { ...base.page.footer, ...(c.page?.footer ?? {}) },
    },
  };
}

// ---- Utilidades para construir documentos (plantillas, importadores) ----

type Mark = { type: string; attrs?: Record<string, unknown> };

export const t = (text: string, marks?: Mark[]): JSONContent => (marks?.length ? { type: 'text', text, marks } : { type: 'text', text });
export const bold = (text: string): JSONContent => t(text, [{ type: 'bold' }]);
export const italic = (text: string): JSONContent => t(text, [{ type: 'italic' }]);
export const colored = (text: string, color: string, extra: Mark[] = []): JSONContent =>
  t(text, [{ type: 'textStyle', attrs: { color } }, ...extra]);

export function p(content?: string | JSONContent[], attrs?: Record<string, unknown>): JSONContent {
  const c = typeof content === 'string' ? (content ? [t(content)] : undefined) : content;
  return { type: 'paragraph', ...(attrs ? { attrs } : {}), ...(c?.length ? { content: c } : {}) };
}

export function h(level: 1 | 2 | 3 | 4 | 5 | 6, content: string | JSONContent[], attrs: Record<string, unknown> = {}): JSONContent {
  const c = typeof content === 'string' ? [t(content)] : content;
  return { type: 'heading', attrs: { level, ...attrs }, content: c };
}

export function ul(items: (string | JSONContent[])[]): JSONContent {
  return { type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) };
}

export function ol(items: (string | JSONContent[])[]): JSONContent {
  return { type: 'orderedList', attrs: { start: 1 }, content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) };
}

export function table(rows: (string | JSONContent[])[][], opts: { header?: boolean } = {}): JSONContent {
  return {
    type: 'table',
    content: rows.map((r, ri) => ({
      type: 'tableRow',
      content: r.map((cell) => ({
        type: opts.header && ri === 0 ? 'tableHeader' : 'tableCell',
        attrs: { colspan: 1, rowspan: 1 },
        content: [p(cell)],
      })),
    })),
  };
}

export const hr = (): JSONContent => ({ type: 'horizontalRule' });
export const pageBreak = (): JSONContent => ({ type: 'pageBreak' });
export const toc = (): JSONContent => ({ type: 'tableOfContents' });
export const footnote = (text: string): JSONContent => ({ type: 'footnote', attrs: { text } });
