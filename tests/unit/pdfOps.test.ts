import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createFolio } from '@/modules/pdf/model';
import { deletePages, extractPages, flattenAnnotations, insertPdf, mergePdfs, reorderPages, rotatePages } from '@/modules/pdf/ops';

async function makePdf(labels: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const l of labels) doc.addPage([300, 400]).drawText(l, { x: 20, y: 350, size: 20, font });
  return doc.save();
}

async function info(bytes: Uint8Array) {
  const d = await PDFDocument.load(bytes);
  return { count: d.getPageCount(), rot: d.getPages().map((p) => p.getRotation().angle), sizes: d.getPages().map((p) => p.getSize().width) };
}

describe('Operaciones PDF (pdf-lib)', () => {
  it('girar, eliminar, reordenar, insertar y extraer páginas conservando identificadores y anotaciones', async () => {
    let c = createFolio(await makePdf(['A', 'B', 'C']), 3);
    const [idA, idB, idC] = c.pageIds;
    c.annotations.push({ id: 'n1', pageId: idB, type: 'note', rect: [10, 10, 100, 60], color: '#facc15', text: 'Revisar: café', createdAt: 0 });
    c = await rotatePages(c, [0], 90);
    expect((await info(c.bytes)).rot).toEqual([90, 0, 0]);
    c = await reorderPages(c, [2, 0, 1]);
    expect(c.pageIds).toEqual([idC, idA, idB]);
    expect((await info(c.bytes)).rot).toEqual([0, 90, 0]);
    c = await insertPdf(c, await makePdf(['X', 'Y']), 0);
    expect((await info(c.bytes)).count).toBe(5);
    expect(c.pageIds[0]).toBe(idC);
    expect(c.pageIds.length).toBe(5);
    c = await deletePages(c, [0]);
    expect(c.pageIds[0]).not.toBe(idC);
    expect(c.annotations).toHaveLength(1);
    c = await deletePages(c, [c.pageIds.indexOf(idB)]);
    expect(c.annotations).toHaveLength(0);
    await expect(deletePages(c, [0, 1, 2])).rejects.toThrow(/todas/);
    const extracted = await extractPages(c, [0, 1]);
    expect((await info(extracted)).count).toBe(2);
  });

  it('combina PDF y aplana anotaciones', async () => {
    const merged = await mergePdfs([await makePdf(['1']), await makePdf(['2', '3'])]);
    expect((await info(merged)).count).toBe(3);
    const c = createFolio(merged, 3);
    c.annotations.push(
      { id: 'h', pageId: c.pageIds[0], type: 'highlight', rect: [10, 340, 200, 370], color: '#facc15', createdAt: 0 },
      { id: 't', pageId: c.pageIds[1], type: 'text', rect: [10, 100, 250, 140], color: '#dc2626', text: 'Aprobado — señal ✓ ñ', createdAt: 0 },
    );
    const flat = await flattenAnnotations(c);
    expect(flat.length).toBeGreaterThan(merged.length);
    expect((await info(flat)).count).toBe(3);
  });
});
