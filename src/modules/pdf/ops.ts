import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { createId } from '@/core/util/id';
import type { Annotation, FolioContent } from './model';

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e))) throw new Error('El PDF está cifrado: se puede ver, pero no modificar sus páginas.');
    throw e;
  }
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPageCount();
}

export async function rotatePages(c: FolioContent, indices: number[], delta: number): Promise<FolioContent> {
  const doc = await load(c.bytes);
  for (const i of indices) {
    const p = doc.getPage(i);
    p.setRotation(degrees((((p.getRotation().angle + delta) % 360) + 360) % 360));
  }
  return { ...c, bytes: await doc.save() };
}

export async function deletePages(c: FolioContent, indices: number[]): Promise<FolioContent> {
  const doc = await load(c.bytes);
  if (indices.length >= doc.getPageCount()) throw new Error('No se pueden eliminar todas las páginas.');
  for (const i of [...indices].sort((a, b) => b - a)) doc.removePage(i);
  const removed = new Set(indices.map((i) => c.pageIds[i]));
  return { ...c, bytes: await doc.save(), pageIds: c.pageIds.filter((_, i) => !indices.includes(i)), annotations: c.annotations.filter((a) => !removed.has(a.pageId)) };
}

/** Reordena según `order` (lista de índices antiguos en el nuevo orden). */
export async function reorderPages(c: FolioContent, order: number[]): Promise<FolioContent> {
  const src = await load(c.bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p) => out.addPage(p));
  copyMeta(src, out);
  return { ...c, bytes: await out.save(), pageIds: order.map((i) => c.pageIds[i]) };
}

/** Inserta otro PDF después de la página `at` (o al final). */
export async function insertPdf(c: FolioContent, other: Uint8Array, at = -1): Promise<FolioContent> {
  const doc = await load(c.bytes);
  const src = await load(other);
  const pages = await doc.copyPages(src, src.getPageIndices());
  const ids = pages.map(() => createId('p'));
  let pos = at < 0 ? doc.getPageCount() : at + 1;
  for (const p of pages) doc.insertPage(pos++, p);
  const pageIds = [...c.pageIds];
  pageIds.splice(at < 0 ? pageIds.length : at + 1, 0, ...ids);
  return { ...c, bytes: await doc.save(), pageIds };
}

/** Nuevo PDF con las páginas indicadas (dividir/extraer). Incluye sus anotaciones aplanadas si se pide. */
export async function extractPages(c: FolioContent, indices: number[], flatten = true): Promise<Uint8Array> {
  const base = flatten ? await flattenAnnotations(c) : c.bytes;
  const src = await load(base);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  copyMeta(src, out);
  return out.save();
}

/** Combina varios PDF en uno. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await load(f);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

function copyMeta(src: PDFDocument, out: PDFDocument) {
  const t = src.getTitle();
  if (t) out.setTitle(t);
  const a = src.getAuthor();
  if (a) out.setAuthor(a);
}

function hexToRgb(hex: string) {
  const v = parseInt(hex.replace('#', ''), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/** Texto compatible con la codificación WinAnsi de las fuentes estándar. */
function winAnsi(s: string): string {
  return s.replace(/[^\u0020-\u007e\u00a0-\u00ff\n\u20ac\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u2026]/g, '?');
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) > maxW && line) {
        out.push(line);
        line = word;
      } else line = tryLine;
    }
    out.push(line);
  }
  return out;
}

/** Dibuja las anotaciones dentro del PDF (visibles en cualquier lector). */
export async function flattenAnnotations(c: FolioContent): Promise<Uint8Array> {
  if (!c.annotations.length) return c.bytes;
  const doc = await load(c.bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  for (const a of c.annotations) {
    const idx = c.pageIds.indexOf(a.pageId);
    if (idx < 0) continue;
    const page = pages[idx];
    const [x1, y1, x2, y2] = a.rect;
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const color = hexToRgb(a.color);
    switch (a.type) {
      case 'highlight':
        page.drawRectangle({ x, y, width: w, height: h, color, opacity: 0.35 });
        break;
      case 'strike':
        page.drawLine({ start: { x, y: y + h / 2 }, end: { x: x + w, y: y + h / 2 }, thickness: Math.max(1, h * 0.08), color });
        break;
      case 'rect':
        page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: 2 });
        break;
      case 'note':
      case 'text': {
        const size = a.fontSize ?? 11;
        if (a.type === 'note') page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 0.97, 0.75), borderColor: color, borderWidth: 1, opacity: 0.95 });
        const lines = wrap(winAnsi(a.text ?? ''), font, size, Math.max(10, w - 8));
        lines.forEach((l, i) => page.drawText(l, { x: x + 4, y: y + h - 4 - size * (i + 1) * 1.15 + size * 0.2, size, font, color: a.type === 'text' ? color : rgb(0.15, 0.15, 0.15) }));
        break;
      }
    }
  }
  return doc.save();
}

export function annotationLabel(a: Annotation): string {
  return { highlight: 'Resaltado', rect: 'Recuadro', note: 'Nota', text: 'Texto', strike: 'Tachado' }[a.type];
}
