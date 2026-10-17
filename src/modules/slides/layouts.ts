import { newId, textDoc, type LayoutId, type Presentation, type Slide, type SlideElement, type TextElement, type Theme } from './model';

export const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: 'title', label: 'Diapositiva de título' },
  { id: 'titleContent', label: 'Título y contenido' },
  { id: 'twoContent', label: 'Dos columnas' },
  { id: 'section', label: 'Encabezado de sección' },
  { id: 'imageText', label: 'Imagen y texto' },
  { id: 'quote', label: 'Cita' },
  { id: 'titleOnly', label: 'Solo título' },
  { id: 'blank', label: 'En blanco' },
];

function text(role: TextElement['role'], x: number, y: number, w: number, h: number, paragraphs: Parameters<typeof textDoc>[0], opts: { bullets?: boolean; vAlign?: 'top' | 'middle' | 'bottom' } = {}): TextElement {
  // El formato va en el cuadro (como un marcador de posición); el texto queda limpio.
  const f = paragraphs[0] ?? { text: '' };
  const font = { size: f.size, color: f.color, family: f.font, bold: f.bold, italic: f.italic, align: f.align };
  const plain = paragraphs.map((p) => ({ text: p.text }));
  return { id: newId(), type: 'text', role, x, y, w, h, rotation: 0, content: textDoc(plain, { bullets: opts.bullets }), style: { vAlign: opts.vAlign ?? 'top', padding: 8, font } };
}

/** Construye los elementos de un diseño con el contenido indicado (o textos de ejemplo). */
export function layoutElements(layout: LayoutId, theme: Theme, size: Presentation['size'], content: { title?: string; subtitle?: string; body?: string[]; body2?: string[]; image?: string } = {}): SlideElement[] {
  const W = size.width;
  const H = size.height;
  const m = 60;
  const t = theme.colors;
  const head = theme.fonts.heading;
  switch (layout) {
    case 'title':
      return [
        text('title', m, H * 0.3, W - m * 2, 120, [{ text: content.title ?? 'Título de la presentación', size: 54, bold: true, color: t.title, align: 'center', font: head }], { vAlign: 'bottom' }),
        text('subtitle', m, H * 0.3 + 135, W - m * 2, 70, [{ text: content.subtitle ?? 'Subtítulo o autor', size: 24, color: t.text, align: 'center' }]),
        { id: newId(), type: 'shape', shape: 'roundRect', x: W / 2 - 40, y: H * 0.3 + 124, w: 80, h: 6, rotation: 0, fill: t.accent[0], stroke: null, strokeWidth: 0 },
      ];
    case 'titleContent':
      return [
        text('title', m, 36, W - m * 2, 80, [{ text: content.title ?? 'Título de la diapositiva', size: 38, bold: true, color: t.title, font: head }], { vAlign: 'bottom' }),
        text('body', m, 136, W - m * 2, H - 136 - 50, (content.body ?? ['Primer punto', 'Segundo punto', 'Tercer punto']).map((b) => ({ text: b, size: 24, color: t.text })), { bullets: true }),
      ];
    case 'twoContent':
      return [
        text('title', m, 36, W - m * 2, 80, [{ text: content.title ?? 'Comparación', size: 38, bold: true, color: t.title, font: head }], { vAlign: 'bottom' }),
        text('body', m, 136, (W - m * 2 - 40) / 2, H - 186, (content.body ?? ['Ventaja uno', 'Ventaja dos']).map((b) => ({ text: b, size: 22, color: t.text })), { bullets: true }),
        text('body', m + (W - m * 2 - 40) / 2 + 40, 136, (W - m * 2 - 40) / 2, H - 186, (content.body2 ?? ['Aspecto uno', 'Aspecto dos']).map((b) => ({ text: b, size: 22, color: t.text })), { bullets: true }),
      ];
    case 'section':
      return [
        { id: newId(), type: 'shape', shape: 'rect', x: 0, y: H * 0.62, w: W, h: H * 0.38, rotation: 0, fill: t.accent[0], stroke: null, strokeWidth: 0 },
        text('title', m, H * 0.25, W - m * 2, 110, [{ text: content.title ?? 'Nueva sección', size: 48, bold: true, color: t.title, font: head }], { vAlign: 'bottom' }),
        text('subtitle', m, H * 0.66, W - m * 2, 60, [{ text: content.subtitle ?? 'Descripción breve', size: 22, color: '#ffffff' }]),
      ];
    case 'imageText':
      return [
        content.image
          ? { id: newId(), type: 'image', x: 0, y: 0, w: W * 0.45, h: H, rotation: 0, src: content.image, alt: '', fit: 'cover' }
          : { id: newId(), type: 'shape', shape: 'rect', x: 0, y: 0, w: W * 0.45, h: H, rotation: 0, fill: t.accent[1], stroke: null, strokeWidth: 0, content: textDoc([{ text: 'Inserta una imagen', size: 20, color: '#ffffff', align: 'center' }]), vAlign: 'middle' },
        text('title', W * 0.45 + 40, 60, W * 0.55 - 80, 100, [{ text: content.title ?? 'Título', size: 36, bold: true, color: t.title, font: head }], { vAlign: 'bottom' }),
        text('body', W * 0.45 + 40, 175, W * 0.55 - 80, H - 230, (content.body ?? ['Describe la imagen o desarrolla la idea principal.']).map((b) => ({ text: b, size: 20, color: t.text }))),
      ];
    case 'quote':
      return [
        text('body', m * 2, H * 0.22, W - m * 4, H * 0.4, [{ text: content.title ?? '“Una cita que inspire a la audiencia.”', size: 36, italic: true, color: t.title, align: 'center', font: head }], { vAlign: 'middle' }),
        text('subtitle', m * 2, H * 0.66, W - m * 4, 50, [{ text: content.subtitle ?? '— Autor de la cita', size: 20, color: t.accent[0], align: 'center' }]),
      ];
    case 'titleOnly':
      return [text('title', m, 36, W - m * 2, 80, [{ text: content.title ?? 'Título', size: 38, bold: true, color: t.title, font: head }], { vAlign: 'bottom' })];
    default:
      return [];
  }
}

export function createSlide(layout: LayoutId, pres: Pick<Presentation, 'theme' | 'size'>, content?: Parameters<typeof layoutElements>[3]): Slide {
  return { id: newId('sl'), layout, elements: layoutElements(layout, pres.theme, pres.size, content), notes: '', transition: { type: 'fade', duration: 0.5 } };
}
