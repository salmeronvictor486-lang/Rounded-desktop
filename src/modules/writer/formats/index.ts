import { decodeText, detectContainer } from '@/core/files/signature';
import { FileFormatError } from '@/core/files/errors';
import { extensionOf, stripExtension } from '@/core/util/format';
import type { ImportResult } from '@/app/types';
import { createEmptyDocument, type WriterContent } from '../model';

export const WRITER_IMPORT_EXTENSIONS = ['docx', 'docm', 'dotx', 'odt', 'ott', 'rtf', 'txt', 'md', 'html', 'htm'];

/** Importa un archivo de texto en cualquiera de los formatos admitidos. */
export async function importWriterFile(name: string, bytes: Uint8Array): Promise<ImportResult<WriterContent>> {
  const ext = extensionOf(name);
  const container = detectContainer(bytes);
  const base = stripExtension(name);
  if (['docx', 'docm', 'dotx'].includes(ext)) {
    if (container !== 'zip') throw new FileFormatError(container === 'ole' ? 'Es un documento .doc antiguo con extensión .docx. Conviértelo con LibreOffice.' : 'El archivo no es un DOCX válido.');
    const { importDocx } = await import('./docx/import');
    const r = await importDocx(bytes);
    return { name: base, content: r.content, warnings: r.warnings };
  }
  if (ext === 'odt' || ext === 'ott') {
    if (container !== 'zip') throw new FileFormatError('El archivo no es un ODT válido.');
    const { importOdt } = await import('./odt');
    const r = await importOdt(bytes);
    return { name: base, content: r.content, warnings: r.warnings };
  }
  if (ext === 'rtf' || container === 'rtf') {
    const { importRtf } = await import('./rtf');
    const text = new TextDecoder('latin1').decode(bytes);
    if (!text.startsWith('{\\rtf')) throw new FileFormatError('El archivo no es un RTF válido.');
    const r = importRtf(text);
    return { name: base, content: r.content, warnings: r.warnings };
  }
  if (container !== 'text') throw new FileFormatError('El archivo no parece de texto.');
  const { text } = decodeText(bytes);
  if (ext === 'html' || ext === 'htm') {
    const { htmlToDoc } = await import('./html');
    const warnings: string[] = [];
    if (/<script/i.test(text)) warnings.push('Los scripts del HTML se han eliminado por seguridad.');
    if (/<img[^>]+src=["']https?:/i.test(text)) warnings.push('Las imágenes remotas no se cargan por privacidad.');
    return { name: base, content: createEmptyDocument(htmlToDoc(text)), warnings };
  }
  if (ext === 'md') {
    const { markdownToDoc } = await import('./markdown');
    return { name: base, content: createEmptyDocument(markdownToDoc(text)), warnings: [] };
  }
  const { textToDoc } = await import('./text');
  return { name: base, content: createEmptyDocument(textToDoc(text)), warnings: [] };
}

export interface WriterExport {
  id: string;
  label: string;
  extension: string;
  mime: string;
  run(content: WriterContent, title: string): Promise<Blob>;
}

export const WRITER_EXPORTS: WriterExport[] = [
  {
    id: 'docx',
    label: 'Documento de Word (.docx)',
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    run: async (c, title) => (await (await import('./docx/export')).exportDocx(c, title)).blob,
  },
  { id: 'odt', label: 'OpenDocument (.odt)', extension: 'odt', mime: 'application/vnd.oasis.opendocument.text', run: async (c, title) => (await import('./odt')).exportOdt(c, title) },
  { id: 'rtf', label: 'Texto enriquecido (.rtf)', extension: 'rtf', mime: 'application/rtf', run: async (c) => (await import('./rtf')).exportRtf(c) },
  {
    id: 'html',
    label: 'Página web (.html)',
    extension: 'html',
    mime: 'text/html',
    run: async (c, title) => new Blob([(await import('./html')).writerToHtml(c, title)], { type: 'text/html;charset=utf-8' }),
  },
  {
    id: 'md',
    label: 'Markdown (.md)',
    extension: 'md',
    mime: 'text/markdown',
    run: async (c) => new Blob([(await import('./text')).docToMarkdown(c.doc)], { type: 'text/markdown;charset=utf-8' }),
  },
  {
    id: 'txt',
    label: 'Texto sin formato (.txt)',
    extension: 'txt',
    mime: 'text/plain',
    run: async (c) => new Blob([(await import('./text')).docToText(c.doc)], { type: 'text/plain;charset=utf-8' }),
  },
];
