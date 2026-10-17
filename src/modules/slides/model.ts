import type { JSONContent } from '@tiptap/core';
import { createId } from '@/core/util/id';

export type Background =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }
  | { type: 'image'; src: string; fit: 'cover' | 'contain' };

export interface Theme {
  id: string;
  name: string;
  colors: { bg: string; text: string; title: string; accent: string[] };
  fonts: { heading: string; body: string };
  background: Background;
}

export type AnimationType = 'appear' | 'fade' | 'fly-up' | 'fly-left' | 'zoom';
export type TransitionType = 'none' | 'fade' | 'slide' | 'zoom';

interface ElementBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity?: number;
  animation?: { type: AnimationType } | null;
  /** Marcador del diseño (título, subtítulo, cuerpo). */
  role?: 'title' | 'subtitle' | 'body';
  name?: string;
}

export interface TextFontDefaults {
  size?: number;
  color?: string;
  family?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface TextBoxStyle {
  /** Formato por defecto del texto del cuadro (se conserva aunque se reescriba todo el texto). */
  font?: TextFontDefaults;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  vAlign?: 'top' | 'middle' | 'bottom';
  padding?: number;
  radius?: number;
}

export interface TextElement extends ElementBase {
  type: 'text';
  content: JSONContent;
  style: TextBoxStyle;
}

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'arrowRight' | 'arrowLeft' | 'chevron' | 'callout' | 'heart' | 'cloud';

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  content?: JSONContent;
  vAlign?: 'top' | 'middle' | 'bottom';
}

export interface LineElement extends ElementBase {
  type: 'line';
  stroke: string;
  strokeWidth: number;
  /** El segmento va de la esquina superior izquierda a la inferior derecha (o al revés si flip). */
  flipH?: boolean;
  flipV?: boolean;
  arrowEnd?: boolean;
  arrowStart?: boolean;
  dash?: 'solid' | 'dash' | 'dot';
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string;
  alt: string;
  fit: 'cover' | 'contain' | 'fill';
  radius?: number;
}

export interface TableCellData {
  text: string;
  bold?: boolean;
  fill?: string | null;
  color?: string | null;
  align?: 'left' | 'center' | 'right';
}

export interface TableElement extends ElementBase {
  type: 'table';
  rows: TableCellData[][];
  /** Fracciones del ancho total. */
  colWidths: number[];
  fontSize: number;
  headerRow: boolean;
  borderColor: string;
  headerFill: string;
}

export type SlideElement = TextElement | ShapeElement | LineElement | ImageElement | TableElement;

export interface Slide {
  id: string;
  layout: LayoutId;
  background?: Background | null;
  elements: SlideElement[];
  notes: string;
  transition?: { type: TransitionType; duration: number };
  hidden?: boolean;
}

export interface Presentation {
  format: 'rounded-stage';
  version: 1;
  size: { width: number; height: number };
  theme: Theme;
  slides: Slide[];
}

export type LayoutId = 'title' | 'titleContent' | 'section' | 'twoContent' | 'titleOnly' | 'blank' | 'imageText' | 'quote';

export const SLIDE_SIZES = {
  '16:9': { width: 960, height: 540, label: 'Panorámica 16:9' },
  '4:3': { width: 960, height: 720, label: 'Estándar 4:3' },
  '16:10': { width: 960, height: 600, label: '16:10' },
} as const;

// ---------- Utilidades de contenido de texto ----------

export function textDoc(paragraphs: { text: string; size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; font?: string; italic?: boolean }[], opts: { bullets?: boolean } = {}): JSONContent {
  const para = (p: (typeof paragraphs)[number]): JSONContent => {
    const marks: JSONContent['marks'] = [];
    const ts: Record<string, string> = {};
    if (p.size) ts.fontSize = `${p.size}px`;
    if (p.color) ts.color = p.color;
    if (p.font) ts.fontFamily = p.font;
    if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts });
    if (p.bold) marks.push({ type: 'bold' });
    if (p.italic) marks.push({ type: 'italic' });
    return { type: 'paragraph', attrs: { textAlign: p.align ?? null }, ...(p.text ? { content: [{ type: 'text', text: p.text, ...(marks.length ? { marks } : {}) }] } : {}) };
  };
  if (opts.bullets) return { type: 'doc', content: [{ type: 'bulletList', content: paragraphs.map((p) => ({ type: 'listItem', content: [para(p)] })) }] };
  return { type: 'doc', content: paragraphs.map(para) };
}

export function plainText(content: JSONContent | undefined): string {
  if (!content) return '';
  const walk = (n: JSONContent): string => {
    if (n.type === 'text') return n.text ?? '';
    if (n.type === 'hardBreak') return '\n';
    const inner = (n.content ?? []).map(walk).join(n.type === 'doc' || n.type === 'bulletList' || n.type === 'orderedList' || n.type === 'listItem' ? '\n' : '');
    return inner;
  };
  return walk(content).replace(/\n{2,}/g, '\n').trim();
}

export function newId(prefix = 'e'): string {
  return createId(prefix);
}
