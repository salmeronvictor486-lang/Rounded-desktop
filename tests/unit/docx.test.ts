import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/modules/writer/formats/docx/export';
import { importDocx } from '@/modules/writer/formats/docx/import';
import { createEmptyDocument, h, p, t, table, ul, ol, footnote, pageBreak } from '@/modules/writer/model';

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sample() {
  const c = createEmptyDocument({
    type: 'doc',
    content: [
      h(1, 'Informe anual'),
      p([t('Texto en '), t('negrita', [{ type: 'bold' }]), t(' y '), t('cursiva roja', [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#ff0000' } }]), footnote('Una nota al pie')]),
      p('Centrado', { textAlign: 'center' }),
      ul(['Uno', 'Dos']),
      ol(['Primero', 'Segundo']),
      table([['A', 'B'], ['1', '2']], { header: true }),
      pageBreak(),
      { type: 'image', attrs: { src: PNG_1x1, width: 50, align: 'center', alt: 'pixel' } },
      h(2, 'Conclusión'),
      p([t('Enlace', [{ type: 'link', attrs: { href: 'https://example.org' } }])]),
    ],
  });
  c.page.orientation = 'landscape';
  c.page.header = { text: 'Encabezado', align: 'right' };
  c.page.footer = { text: 'Página {page} de {pages}', align: 'center' };
  return c;
}

describe('DOCX ida y vuelta', () => {
  it('conserva estructura, formato, tablas, listas, imágenes, notas y página', async () => {
    const bytes = await exportDocxBuffer(sample(), 'Prueba');
    expect(bytes[0]).toBe(0x50);
    const { content, warnings } = await importDocx(bytes);
    const blocks = content.doc.content!;
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(['heading', 'paragraph', 'paragraph', 'bulletList', 'orderedList', 'table', 'pageBreak', 'image', 'heading', 'paragraph']);
    expect(blocks[0].attrs?.level).toBe(1);
    const para = blocks[1].content!;
    expect(para.find((n) => n.text === 'negrita')?.marks?.[0].type).toBe('bold');
    const red = para.find((n) => n.text === 'cursiva roja')!;
    expect(red.marks!.map((m) => m.type).sort()).toEqual(['italic', 'textStyle']);
    expect(red.marks!.find((m) => m.type === 'textStyle')!.attrs!.color).toBe('#ff0000');
    expect(para.find((n) => n.type === 'footnote')?.attrs?.text).toBe('Una nota al pie');
    expect(blocks[2].attrs?.textAlign).toBe('center');
    expect(blocks[3].content).toHaveLength(2);
    expect(blocks[5].content).toHaveLength(2);
    expect(blocks[5].content![0].content![0].type).toBe('tableHeader');
    expect(blocks[7].attrs?.src).toMatch(/^data:image\/png;base64,/);
    expect(blocks[7].attrs?.width).toBe(50);
    expect(blocks[9].content![0].marks!.some((m) => m.type === 'link' && m.attrs!.href === 'https://example.org')).toBe(true);
    expect(content.page.orientation).toBe('landscape');
    expect(content.page.header.text).toBe('Encabezado');
    expect(content.page.footer.text).toBe('Página {page} de {pages}');
    expect(warnings).toEqual([]);
  });
});
