import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  EndnoteReferenceRun,
  ExternalHyperlink,
  FootnoteReferenceRun,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import type { JSONContent } from '@tiptap/core';
import { BRAND } from '@/config/brand';
import { dataUrlToBytes } from '@/core/files/download';
import { nearestWordHighlight, toHex6, WORD_HIGHLIGHTS } from '@/core/util/color';
import { imageSize, rasterizeToPng } from '@/core/util/imageSize';
import { mmToPx, pxToTwip } from '@/core/util/units';
import { INDENT_STEP_PX } from '../../extensions/paragraphFormat';
import { collectHeadingsJson } from '../../extensions/toc';
import { normalizeWriterContent, pageDimensions, type HeaderFooter, type TextStyleDef, type WriterContent } from '../../model';

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
export const DEFAULT_HEADING_SIZES = [20, 16, 13, 12, 11, 11];
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

type Mark = { type: string; attrs?: Record<string, any> };

function parseFontSize(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v);
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  if (s.endsWith('px')) return Math.round((n * 72) / 96 * 2) / 2;
  return n;
}

function cleanFont(f: unknown): string | undefined {
  if (typeof f !== 'string' || !f) return undefined;
  return f.split(',')[0].replace(/["']/g, '').trim() || undefined;
}

interface Ctx {
  orderedInstances: number;
  contentWidthPx: number;
  headingIndex: number;
  warnings: Set<string>;
  doc: JSONContent;
  startRefs: Set<number>;
}

function runOptions(marks: Mark[] = []): Partial<IRunOptions> & Record<string, any> {
  const o: Record<string, any> = {};
  for (const m of marks) {
    switch (m.type) {
      case 'bold':
        o.bold = true;
        break;
      case 'italic':
        o.italics = true;
        break;
      case 'underline':
        o.underline = {};
        break;
      case 'strike':
        o.strike = true;
        break;
      case 'superscript':
        o.superScript = true;
        break;
      case 'subscript':
        o.subScript = true;
        break;
      case 'code':
        o.font = 'Consolas';
        break;
      case 'textStyle': {
        const color = toHex6(m.attrs?.color);
        if (color) o.color = color;
        const size = parseFontSize(m.attrs?.fontSize);
        if (size) o.size = Math.round(size * 2);
        const font = cleanFont(m.attrs?.fontFamily);
        if (font) o.font = font;
        const bg = toHex6(m.attrs?.backgroundColor);
        if (bg) o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: bg };
        break;
      }
      case 'highlight': {
        const hex = toHex6(m.attrs?.color) ?? 'FFFF00';
        const name = Object.entries(WORD_HIGHLIGHTS).find(([, v]) => v === hex)?.[0];
        if (name) o.highlight = name;
        else o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex };
        break;
      }
    }
  }
  return o;
}

function textRuns(text: string, opts: Record<string, any>): TextRun[] {
  const parts = text.split('\t');
  if (parts.length === 1) return [new TextRun({ ...opts, text })];
  const children: (string | Tab)[] = [];
  parts.forEach((p, i) => {
    if (i > 0) children.push(new Tab());
    if (p) children.push(p);
  });
  return [new TextRun({ ...opts, children })];
}

async function imageRun(node: JSONContent, ctx: Ctx): Promise<ImageRun | null> {
  const src = String(node.attrs?.src ?? '');
  if (!src.startsWith('data:')) return null;
  let { bytes, mime } = dataUrlToBytes(src);
  let size = imageSize(bytes);
  if (!size) return null;
  let type = size.type;
  if (type === 'webp' || type === 'svg') {
    try {
      bytes = await rasterizeToPng(src, size.width, size.height);
      mime = 'image/png';
      type = 'png';
      size = { ...size, type: 'png' };
    } catch {
      ctx.warnings.add('Algunas imágenes no se pudieron convertir para Word.');
      return null;
    }
  }
  void mime;
  let width = Number(node.attrs?.width) || size.width;
  width = Math.min(width, ctx.contentWidthPx);
  const height = Math.round((width * size.height) / Math.max(1, size.width));
  return new ImageRun({
    type: type as 'png' | 'jpg' | 'gif' | 'bmp',
    data: bytes,
    transformation: { width: Math.round(width), height },
    altText: node.attrs?.alt ? { name: 'Imagen', description: String(node.attrs.alt), title: String(node.attrs.alt) } : undefined,
  });
}

async function inlineChildren(nodes: JSONContent[] = [], ctx: Ctx, extra: Record<string, any> = {}): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      const marks = (n.marks ?? []) as Mark[];
      const link = marks.find((m) => m.type === 'link');
      const opts = { ...extra, ...runOptions(marks) };
      if (link) {
        const href = String(link.attrs?.href ?? '');
        const runs = textRuns(n.text ?? '', { ...opts, style: 'Hyperlink' });
        out.push(href.startsWith('#') ? new InternalHyperlink({ anchor: href.slice(1), children: runs }) : new ExternalHyperlink({ link: href, children: runs }));
      } else {
        out.push(...textRuns(n.text ?? '', opts));
      }
    } else if (n.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
    } else if (n.type === 'footnote') {
      const content = { children: [new Paragraph({ children: [new TextRun(String(n.attrs?.text ?? ''))] })] };
      out.push(n.attrs?.kind === 'endnote' ? new EndnoteReferenceRun(content) : new FootnoteReferenceRun(content));
    } else if (n.type === 'image') {
      const img = await imageRun(n, ctx);
      if (img) out.push(img);
    }
  }
  return out;
}

function paragraphAttrs(attrs: Record<string, any> = {}): Partial<IParagraphOptions> {
  const o: Record<string, any> = {};
  if (attrs.textAlign && ALIGN[attrs.textAlign]) o.alignment = ALIGN[attrs.textAlign];
  const indent: Record<string, number> = {};
  if (attrs.indent) indent.left = pxToTwip(attrs.indent * INDENT_STEP_PX);
  if (attrs.firstLineIndent) {
    if (attrs.firstLineIndent > 0) indent.firstLine = pxToTwip(attrs.firstLineIndent);
    else indent.hanging = pxToTwip(-attrs.firstLineIndent);
  }
  if (Object.keys(indent).length) o.indent = indent;
  const spacing: Record<string, number> = {};
  if (attrs.spaceBefore != null) spacing.before = Math.round(attrs.spaceBefore * 20);
  if (attrs.spaceAfter != null) spacing.after = Math.round(attrs.spaceAfter * 20);
  if (attrs.lineHeight) spacing.line = Math.round(attrs.lineHeight * 240);
  if (Object.keys(spacing).length) o.spacing = spacing;
  return o;
}

async function blocks(nodes: JSONContent[] = [], ctx: Ctx, list?: { level: number; ordered: boolean; instance: number; start: number }): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph': {
        const children = await inlineChildren(n.content, ctx);
        const opts: IParagraphOptions = { ...paragraphAttrs(n.attrs), children };
        if (list) {
          (opts as any).numbering = { reference: list.ordered ? `rd-ordered-${list.start}` : 'rd-bullet', level: Math.min(8, list.level), instance: list.instance };
        }
        out.push(new Paragraph(opts));
        break;
      }
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
        const children = await inlineChildren(n.content, ctx);
        const id = ctx.headingIndex++;
        out.push(
          new Paragraph({
            ...paragraphAttrs(n.attrs),
            heading: HEADINGS[level - 1],
            children: [new Bookmark({ id: `rd_h${id}`, children: children as any })],
          }),
        );
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const ordered = n.type === 'orderedList';
        const start = Math.max(1, Number(n.attrs?.start ?? 1));
        if (ordered) ctx.startRefs.add(start);
        const level = list ? list.level + 1 : 0;
        const instance = list && list.ordered === ordered ? list.instance : ++ctx.orderedInstances;
        for (const li of n.content ?? []) {
          for (const c of li.content ?? []) {
            if (c.type === 'paragraph') out.push(...(await blocks([c], ctx, { level, ordered, instance, start })));
            else out.push(...(await blocks([c], ctx, { level, ordered, instance, start })));
          }
        }
        break;
      }
      case 'blockquote':
        for (const c of n.content ?? []) {
          const children = await inlineChildren(c.content, ctx, { italics: true, color: '555555' });
          out.push(
            new Paragraph({
              ...paragraphAttrs(c.attrs),
              indent: { left: 567 },
              border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'BBBBBB', space: 8 } },
              children,
            }),
          );
        }
        break;
      case 'codeBlock': {
        const text = (n.content ?? []).map((c) => c.text ?? '').join('');
        for (const line of text.split('\n')) {
          out.push(
            new Paragraph({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' },
              spacing: { after: 0 },
              children: textRuns(line || ' ', { font: 'Consolas', size: 20 }),
            }),
          );
        }
        break;
      }
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA', space: 1 } }, children: [] }));
        break;
      case 'pageBreak':
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'image': {
        const img = await imageRun(n, ctx);
        if (img) out.push(new Paragraph({ alignment: ALIGN[n.attrs?.align] ?? AlignmentType.LEFT, children: [img] }));
        break;
      }
      case 'tableOfContents': {
        const entries = collectHeadingsJson(ctx.doc, Number(n.attrs?.maxLevel ?? 3));
        out.push(new Paragraph({ children: [new TextRun({ text: String(n.attrs?.title ?? 'Índice'), bold: true, size: 28 })], spacing: { after: 120 } }));
        for (const e of entries) {
          out.push(
            new Paragraph({
              indent: { left: (e.level - 1) * 360 },
              spacing: { after: 60 },
              children: [new InternalHyperlink({ anchor: `rd_h${e.index}`, children: [new TextRun({ text: e.text, color: '1F3A8A' })] })],
            }),
          );
        }
        break;
      }
      case 'table':
        out.push(await table(n, ctx));
        break;
      default:
        if (n.content) out.push(...(await blocks(n.content, ctx, list)));
    }
  }
  return out;
}

async function table(n: JSONContent, ctx: Ctx): Promise<Table> {
  const rows: TableRow[] = [];
  let columnWidths: number[] | undefined;
  const firstRow = n.content?.[0];
  if (firstRow) {
    const widths: number[] = [];
    for (const cell of firstRow.content ?? []) {
      const cw = cell.attrs?.colwidth as number[] | null;
      const span = Number(cell.attrs?.colspan ?? 1);
      for (let i = 0; i < span; i++) widths.push(cw?.[i] ?? 0);
    }
    if (widths.length && widths.every((w) => w > 0)) columnWidths = widths.map((w) => pxToTwip(w));
    else if (widths.length) {
      const each = Math.floor(pxToTwip(ctx.contentWidthPx) / widths.length);
      columnWidths = widths.map(() => each);
    }
  }
  for (const r of n.content ?? []) {
    const cells: TableCell[] = [];
    const isHeader = (r.content ?? []).every((c) => c.type === 'tableHeader');
    for (const c of r.content ?? []) {
      const childBlocks = await blocks(c.content, ctx);
      const bg = toHex6(c.attrs?.backgroundColor) ?? (c.type === 'tableHeader' ? 'F2F2F2' : null);
      const va = c.attrs?.verticalAlign;
      const cw = c.attrs?.colwidth as number[] | null;
      cells.push(
        new TableCell({
          children: childBlocks.length ? childBlocks : [new Paragraph({})],
          columnSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined,
          rowSpan: Number(c.attrs?.rowspan ?? 1) > 1 ? Number(c.attrs?.rowspan) : undefined,
          shading: bg ? { type: ShadingType.CLEAR, color: 'auto', fill: bg } : undefined,
          verticalAlign: va === 'middle' ? VerticalAlign.CENTER : va === 'bottom' ? VerticalAlign.BOTTOM : undefined,
          width: cw?.length ? { size: pxToTwip(cw.reduce((a, b) => a + b, 0)), type: WidthType.DXA } : undefined,
        }),
      );
    }
    rows.push(new TableRow({ children: cells, tableHeader: isHeader || undefined }));
  }
  return new Table({
    rows,
    columnWidths,
    width: columnWidths ? { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA } : { size: 100, type: WidthType.PERCENTAGE },
  });
}

function headerFooterParagraph(hf: HeaderFooter): Paragraph {
  const children: (string | any)[] = [];
  const re = /\{(page|pages)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hf.text))) {
    if (m.index > last) children.push(hf.text.slice(last, m.index));
    children.push(m[1] === 'page' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES);
    last = m.index + m[0].length;
  }
  if (last < hf.text.length) children.push(hf.text.slice(last));
  return new Paragraph({ alignment: ALIGN[hf.align], children: [new TextRun({ children, size: 18, color: '666666' })] });
}

function styleRun(def: TextStyleDef | undefined, fallback: { size: number; bold?: boolean }) {
  return {
    size: Math.round((def?.fontSize ?? fallback.size) * 2),
    bold: def?.bold ?? fallback.bold,
    italics: def?.italic,
    color: toHex6(def?.color) ?? undefined,
    font: cleanFont(def?.fontFamily),
  };
}

/** Exporta el documento a DOCX (OOXML). */
export async function exportDocx(input: WriterContent, title = 'Documento'): Promise<{ blob: Blob; warnings: string[] }> {
  const content = normalizeWriterContent(input);
  const page = content.page;
  const dims = pageDimensions(page);
  const contentWidthMm = (dims.width - page.margins.left - page.margins.right) / page.columns;
  const ctx: Ctx = {
    orderedInstances: 0,
    contentWidthPx: mmToPx(contentWidthMm),
    headingIndex: 0,
    warnings: new Set(),
    doc: content.doc,
    startRefs: new Set([1]),
  };
  const children = await blocks(content.doc.content, ctx);
  const body = content.styles?.body;

  const bulletChars = ['•', '◦', '▪'];
  const orderedFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const levelIndent = (i: number) => ({ paragraph: { indent: { left: 720 + i * 360, hanging: 360 } } });

  const hasHeader = !!page.header.text.trim();
  const hasFooter = !!page.footer.text.trim();
  const twip = (mm: number) => pxToTwip(mmToPx(mm));

  const doc = new Document({
    creator: BRAND.apps.document.name,
    title,
    description: `Creado con ${BRAND.suiteName}`,
    styles: {
      default: {
        document: {
          run: { font: cleanFont(body?.fontFamily) ?? 'Calibri', size: Math.round((body?.fontSize ?? 11) * 2), color: toHex6(body?.color) ?? undefined },
          paragraph: { spacing: { after: Math.round((body?.spaceAfter ?? 8) * 20), line: Math.round((body?.lineHeight ?? 1.15) * 240) } },
        },
      },
      paragraphStyles: [1, 2, 3, 4, 5, 6].map((lvl) => ({
        id: `Heading${lvl}`,
        name: `Heading ${lvl}`,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: styleRun(content.styles?.headings?.[lvl as 1], { size: DEFAULT_HEADING_SIZES[lvl - 1], bold: true }),
        paragraph: { spacing: { before: lvl <= 2 ? 360 : 240, after: 120 }, keepNext: true, outlineLevel: lvl - 1 },
      })),
      characterStyles: [{ id: 'Hyperlink', name: 'Hyperlink', basedOn: 'DefaultParagraphFont', run: { color: '1D4ED8', underline: {} } }],
    },
    numbering: {
      config: [
        {
          reference: 'rd-bullet',
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: LevelFormat.BULLET,
            text: bulletChars[i % 3],
            alignment: AlignmentType.LEFT,
            style: levelIndent(i),
          })),
        },
        ...Array.from(ctx.startRefs).map((start) => ({
          reference: `rd-ordered-${start}`,
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: orderedFormats[i % 3],
            text: `%${i + 1}.`,
            start: i === 0 ? start : 1,
            alignment: AlignmentType.LEFT,
            style: levelIndent(i),
          })),
        })),
      ],
    },
    sections: [
      {
        properties: {
          titlePage: page.differentFirstPage,
          page: {
            // La biblioteca docx intercambia ancho y alto cuando la orientación es horizontal: se pasa el tamaño vertical.
            size: { width: twip(Math.min(dims.width, dims.height)), height: twip(Math.max(dims.width, dims.height)), orientation: page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: twip(page.margins.top), right: twip(page.margins.right), bottom: twip(page.margins.bottom), left: twip(page.margins.left), header: 708, footer: 708 },
          },
          column: page.columns > 1 ? { count: page.columns, space: twip(page.columnGap), equalWidth: true } : undefined,
        },
        headers: hasHeader
          ? { default: new Header({ children: [headerFooterParagraph(page.header)] }), ...(page.differentFirstPage ? { first: new Header({ children: [new Paragraph({})] }) } : {}) }
          : undefined,
        footers: hasFooter
          ? { default: new Footer({ children: [headerFooterParagraph(page.footer)] }), ...(page.differentFirstPage ? { first: new Footer({ children: [new Paragraph({})] }) } : {}) }
          : undefined,
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return { blob, warnings: Array.from(ctx.warnings) };
}

/** Variante para Node/pruebas. */
export async function exportDocxBuffer(input: WriterContent, title = 'Documento'): Promise<Uint8Array> {
  const { blob } = await exportDocx(input, title);
  return new Uint8Array(await blob.arrayBuffer());
}

export { nearestWordHighlight };
