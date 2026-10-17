import { describe, expect, it } from 'vitest';
import { listTemplates } from '@/templates/registry';
import { jsonToNode } from '@/modules/writer/formats/html';
import { exportDocxBuffer } from '@/modules/writer/formats/docx/export';
import { Engine } from '@/modules/sheets/engine/engine';
import { isError } from '@/modules/sheets/engine/values';
import { exportXlsx } from '@/modules/sheets/formats/xlsx';
import { exportPptx } from '@/modules/slides/formats/pptxExport';
import type { WriterContent } from '@/modules/writer/model';
import type { Workbook } from '@/modules/sheets/model';
import type { Presentation } from '@/modules/slides/model';

const all = listTemplates();

describe('Biblioteca de plantillas', () => {
  it('cubre las categorías y aplicaciones principales', () => {
    expect(all.length).toBeGreaterThanOrEqual(18);
    const cats = new Set(all.map((t) => t.category));
    for (const c of ['Currículums', 'Cartas', 'Informes', 'Académico', 'Apuntes', 'Facturas y presupuestos', 'Planificación', 'Finanzas', 'Proyectos', 'Empresa', 'Tecnología', 'Educación', 'Portfolios']) expect(cats).toContain(c);
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
  });

  it.each(all.filter((t) => t.kind === 'document').map((t) => [t.name, t]))('documento «%s» es válido y exportable a DOCX', async (_n, t) => {
    const c = t.build() as WriterContent;
    expect(() => jsonToNode(c.doc)).not.toThrow();
    const bytes = await exportDocxBuffer(c, t.name);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it.each(all.filter((t) => t.kind === 'spreadsheet').map((t) => [t.name, t]))('hoja «%s» calcula sin errores y exporta a XLSX', async (_n, t) => {
    const wb = t.build() as Workbook;
    const engine = new Engine(wb);
    for (const sheet of wb.sheets)
      for (const [k, cell] of Object.entries(sheet.cells)) {
        if (cell.f === undefined) continue;
        const [r, c] = k.split(',').map(Number);
        const v = engine.getValue(sheet.id, r, c);
        expect(isError(v), `${sheet.name}!${k} = ${cell.f} → ${isError(v) ? v.code : v}`).toBe(false);
      }
    const { blob } = await exportXlsx(wb);
    expect(blob.size).toBeGreaterThan(1000);
  });

  it.each(all.filter((t) => t.kind === 'presentation').map((t) => [t.name, t]))('presentación «%s» tiene diapositivas y exporta a PPTX', async (_n, t) => {
    const p = t.build() as Presentation;
    expect(p.slides.length).toBeGreaterThanOrEqual(4);
    const { blob } = await exportPptx(p, t.name);
    expect(blob.size).toBeGreaterThan(5000);
  });
});
