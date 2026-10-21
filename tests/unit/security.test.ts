import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';
import { DEFAULT_LIMITS, getLimits, setLimits } from '@/config/limits';
import { SecurityError } from '@/core/files/errors';
import { isSafeImageSrc, isSafeLinkHref, readFileBytes } from '@/core/files/validate';
import { parseXml } from '@/core/files/xml';
import { inspectZip } from '@/core/files/zipGuard';
import { exportDocxBuffer } from '@/modules/writer/formats/docx/export';
import { sanitizeHtml } from '@/modules/writer/formats/html';
import { importWriterFile } from '@/modules/writer/formats';
import { importSheetsFile } from '@/modules/sheets/formats';
import { exportXlsx } from '@/modules/sheets/formats/xlsx';
import { createEmptyDocument, p, t } from '@/modules/writer/model';
import { createWorkbook } from '@/modules/sheets/model';

const zip = async (files: Record<string, string | Uint8Array>) => {
  const z = new JSZip();
  for (const [name, data] of Object.entries(files)) z.file(name, data, { createFolders: false });
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};

const marksOf = (n: JSONContent): JSONContent['marks'] => [...(n.marks ?? []), ...(n.content ?? []).flatMap((c) => marksOf(c) ?? [])];

describe('ZIP', () => {
  it('acepta un ZIP normal y devuelve sus entradas', async () => {
    const entries = inspectZip(await zip({ 'a.txt': 'hola', 'dir/b.xml': '<a/>' }));
    expect(entries.map((e) => e.name).sort()).toEqual(['a.txt', 'dir/b.xml']);
  });

  it('rechaza rutas que salen de la carpeta (path traversal) o absolutas', async () => {
    await expect(zip({ '../fuera.txt': 'x' }).then(inspectZip)).rejects.toThrow(SecurityError);
    await expect(zip({ '/etc/passwd': 'x' }).then(inspectZip)).rejects.toThrow(SecurityError);
    await expect(zip({ 'a/../../b': 'x' }).then(inspectZip)).rejects.toThrow(SecurityError);
  });

  it('rechaza relaciones de compresión de «zip bomb», demasiadas entradas y tamaño descomprimido excesivo', async () => {
    const bomb = await zip({ 'ceros.bin': new Uint8Array(20 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(100 * 1024);
    expect(() => inspectZip(bomb)).toThrow(/compresión/);
    const many = await zip(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}.txt`, 'x'])));
    expect(() => inspectZip(many, { ...DEFAULT_LIMITS, maxZipEntries: 10 })).toThrow(/entradas/);
    const big = await zip({ 'a.txt': 'x'.repeat(5000), 'b.txt': 'y'.repeat(5000) });
    expect(() => inspectZip(big, { ...DEFAULT_LIMITS, maxZipUncompressedBytes: 8000 })).toThrow(/descomprimido/);
  });

  it('los importadores aplican la comprobación antes de descomprimir', async () => {
    const evil = await zip({ '[Content_Types].xml': '<Types/>', '../../evil.xml': '<a/>' });
    await expect(importWriterFile('x.docx', evil)).rejects.toThrow(SecurityError);
    await expect(importSheetsFile('x.xlsx', evil)).rejects.toThrow(SecurityError);
  });

  it('no son ZIP: se rechazan con un error comprensible', () => {
    expect(() => inspectZip(new TextEncoder().encode('no soy un zip'))).toThrow(/ZIP/);
  });
});

describe('XML', () => {
  it('rechaza DOCTYPE y entidades (XXE, «billion laughs»)', () => {
    expect(() => parseXml('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>')).toThrow(SecurityError);
    expect(() => parseXml('<a><!ENTITY lol "lol"></a>')).toThrow(SecurityError);
  });

  it('analiza XML válido y rechaza el mal formado', () => {
    expect(parseXml('<a><b c="1"/></a>').documentElement.localName).toBe('a');
    expect(() => parseXml('<a><b></a>')).toThrow(/mal formado/);
  });
});

describe('enlaces, imágenes y HTML', () => {
  it('solo admite protocolos seguros en enlaces', () => {
    for (const ok of ['https://example.org', 'http://a.b/c?d', 'mailto:a@b.c', 'tel:+34600000000', '#seccion', 'relativo/pagina']) expect(isSafeLinkHref(ok)).toBe(true);
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'vbscript:x', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) expect(isSafeLinkHref(bad)).toBe(false);
  });

  it('solo carga imágenes incrustadas (sin peticiones a terceros)', () => {
    expect(isSafeImageSrc('data:image/png;base64,AAAA')).toBe(true);
    expect(isSafeImageSrc('blob:http://localhost/1')).toBe(true);
    expect(isSafeImageSrc('https://rastreador.example/pixel.gif')).toBe(false);
    expect(isSafeImageSrc('data:text/html;base64,AAAA')).toBe(false);
  });

  it('el HTML pegado o importado pierde scripts, manejadores y marcos', () => {
    const clean = sanitizeHtml('<p onclick="x()">Hola<script>alert(1)</script><img src="x" onerror="alert(1)"><iframe src="https://a"></iframe><a href="javascript:alert(1)">enlace</a></p>');
    expect(clean).not.toMatch(/script|onerror|onclick|iframe|javascript:/i);
    expect(clean).toContain('Hola');
  });

  it('al importar un documento se quitan enlaces peligrosos e imágenes remotas', async () => {
    const doc = createEmptyDocument({
      type: 'doc',
      content: [
        p([t('malo', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]), t(' y '), t('bueno', [{ type: 'link', attrs: { href: 'https://example.org' } }])]),
      ],
    });
    const bytes = await exportDocxBuffer(doc, 'x');
    const r = await importWriterFile('enlaces.docx', bytes);
    const links = (marksOf(r.content.doc) ?? []).filter((m) => m.type === 'link').map((m) => m.attrs?.href);
    expect(links).toEqual(['https://example.org']);
    expect(r.warnings.join(' ')).toMatch(/enlaces/);
    const html = await importWriterFile('x.html', new TextEncoder().encode('<p>a<img src="https://rastreador.example/p.gif"></p>'));
    expect(JSON.stringify(html.content.doc)).not.toContain('rastreador');
  });
});

describe('contenido activo y límites', () => {
  it('las macros se descartan con aviso y nunca se ejecutan', async () => {
    const docx = await JSZip.loadAsync(await exportDocxBuffer(createEmptyDocument({ type: 'doc', content: [p('Texto')] }), 'x'));
    docx.file('word/vbaProject.bin', new Uint8Array([1, 2, 3]));
    const r = await importWriterFile('macro.docm', await docx.generateAsync({ type: 'uint8array' }));
    expect(r.warnings.join(' ')).toMatch(/macros/);
    expect(JSON.stringify(r.content.doc)).toContain('Texto');

    const wb = createWorkbook();
    const { blob } = await exportXlsx(wb);
    const xlsx = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
    xlsx.file('xl/vbaProject.bin', new Uint8Array([1, 2, 3]));
    const s = await importSheetsFile('macro.xlsm', await xlsx.generateAsync({ type: 'uint8array' }));
    expect(s.warnings.join(' ')).toMatch(/macros/);
  });

  it('rechaza archivos por encima del límite de tamaño configurado', async () => {
    const before = getLimits();
    try {
      setLimits({ maxFileBytes: 10 });
      await expect(readFileBytes(new Blob(['01234567890123']))).rejects.toThrow(/límite/);
      await expect(readFileBytes(new Blob(['0123']))).resolves.toHaveLength(4);
    } finally {
      setLimits(before);
    }
  });
});
