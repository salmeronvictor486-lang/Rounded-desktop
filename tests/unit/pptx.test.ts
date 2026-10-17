import { describe, expect, it } from 'vitest';
import { exportPptx } from '@/modules/slides/formats/pptxExport';
import { importPptx } from '@/modules/slides/formats/pptxImport';
import { createPresentation } from '@/modules/slides/model.create';
import { createSlide } from '@/modules/slides/layouts';
import { plainText, textDoc, type Presentation } from '@/modules/slides/model';
import { SlidesStore } from '@/modules/slides/store';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEIGBkZGQAAJAQD/c8B4u4AAAAASUVORK5CYII=';

function sample(): Presentation {
  const p = createPresentation('aurora');
  p.slides.push(createSlide('titleContent', p, { title: 'Objetivos', body: ['Uno', 'Dos'] }));
  const s = p.slides[1];
  s.notes = 'Notas del orador';
  s.elements.push(
    { id: 'shape1', type: 'shape', shape: 'ellipse', x: 600, y: 300, w: 200, h: 120, rotation: 15, fill: '#ff0000', stroke: '#000000', strokeWidth: 2, content: textDoc([{ text: 'Forma', size: 20, color: '#ffffff' }]) },
    { id: 'img1', type: 'image', x: 50, y: 400, w: 100, h: 100, rotation: 0, src: PNG, alt: 'Logotipo', fit: 'fill' },
    { id: 'tbl1', type: 'table', x: 100, y: 300, w: 400, h: 120, rotation: 0, rows: [[{ text: 'A' }, { text: 'B' }], [{ text: '1' }, { text: '2' }]], colWidths: [0.5, 0.5], fontSize: 16, headerRow: true, borderColor: '#999999', headerFill: '#4f46e5' },
    { id: 'line1', type: 'line', x: 100, y: 200, w: 300, h: 0, rotation: 0, stroke: '#00ff00', strokeWidth: 3, arrowEnd: true },
  );
  s.background = { type: 'solid', color: '#fefce8' };
  return p;
}

describe('PPTX', () => {
  it('ida y vuelta conserva diapositivas, texto, formato, formas, imágenes, tablas, líneas, fondos y notas', async () => {
    const { blob } = await exportPptx(sample(), 'Prueba');
    const { content, warnings } = await importPptx(new Uint8Array(await blob.arrayBuffer()));
    expect(content.slides).toHaveLength(2);
    expect(content.size).toEqual({ width: 960, height: 540 });
    const [s1, s2] = content.slides;
    const texts1 = s1.elements.filter((e) => e.type === 'text').map((e) => plainText((e as any).content));
    expect(texts1).toContain('Título de la presentación');
    const title = s1.elements.find((e) => e.type === 'text' && plainText((e as any).content) === 'Título de la presentación') as any;
    const run = title.content.content[0].content[0];
    expect(run.marks.find((m: any) => m.type === 'bold')).toBeTruthy();
    expect(run.marks.find((m: any) => m.type === 'textStyle').attrs.fontSize).toBe('54px');
    const body = s2.elements.find((e) => e.type === 'text' && plainText((e as any).content).includes('Uno')) as any;
    expect(body.content.content[0].type).toBe('bulletList');
    const shape = s2.elements.find((e) => e.type === 'shape') as any;
    expect(shape).toMatchObject({ shape: 'ellipse', fill: '#ff0000', stroke: '#000000' });
    expect(Math.round(shape.rotation)).toBe(15);
    expect(plainText(shape.content)).toBe('Forma');
    const img = s2.elements.find((e) => e.type === 'image') as any;
    expect(img.src).toMatch(/^data:image\/png;base64,/);
    expect(img.alt).toBe('Logotipo');
    expect(Math.round(img.w)).toBe(100);
    const tbl = s2.elements.find((e) => e.type === 'table') as any;
    expect(tbl.rows.map((r: any) => r.map((c: any) => c.text))).toEqual([['A', 'B'], ['1', '2']]);
    const line = s2.elements.find((e) => e.type === 'line') as any;
    expect(line).toMatchObject({ stroke: '#00ff00', arrowEnd: true });
    expect(s2.background).toEqual({ type: 'solid', color: '#fefce8' });
    expect(s2.notes).toBe('Notas del orador');
    expect(warnings.filter((w) => !/transicion|animac/i.test(w))).toEqual([]);
  });
});

describe('Almacén de diapositivas', () => {
  it('deshacer/rehacer, duplicar, reordenar, alinear y capas', () => {
    const st = new SlidesStore(sample());
    st.goTo(1);
    const n = st.slide.elements.length;
    st.select(['shape1']);
    st.duplicateSelected();
    expect(st.slide.elements).toHaveLength(n + 1);
    st.undo();
    expect(st.slide.elements).toHaveLength(n);
    st.redo();
    expect(st.slide.elements).toHaveLength(n + 1);
    st.select(['shape1']);
    st.align('left');
    expect(st.slide.elements.find((e) => e.id === 'shape1')!.x).toBe(0);
    st.reorder('back');
    expect(st.slide.elements[0].id).toBe('shape1');
    st.moveSlide(1, 0);
    expect(st.pres.slides[0].notes).toBe('Notas del orador');
    st.duplicateSlide(0);
    expect(st.pres.slides).toHaveLength(3);
    st.deleteSlide(1);
    expect(st.pres.slides).toHaveLength(2);
  });
});
