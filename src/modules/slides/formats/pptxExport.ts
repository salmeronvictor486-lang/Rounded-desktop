import PptxGenJS from 'pptxgenjs';
import type { JSONContent } from '@tiptap/core';
import { BRAND } from '@/config/brand';
import { toHex6 } from '@/core/util/color';
import { imageSize, rasterizeToPng } from '@/core/util/imageSize';
import { dataUrlToBytes, bytesToBase64 } from '@/core/files/download';
import type { Background, Presentation, ShapeKind, SlideElement } from '../model';

const PX_PER_IN = 96;
const inch = (px: number) => Math.round((px / PX_PER_IN) * 10000) / 10000;
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10;

const SHAPE_MAP: Partial<Record<ShapeKind, string>> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  star: 'star5',
  arrowRight: 'rightArrow',
  arrowLeft: 'leftArrow',
  chevron: 'chevron',
  callout: 'wedgeRoundRectCallout',
  heart: 'heart',
  cloud: 'cloud',
};

type Run = { text: string; options: Record<string, unknown> };

function cleanFont(f: unknown): string | undefined {
  return typeof f === 'string' && f ? f.split(',')[0].replace(/["']/g, '').trim() : undefined;
}

/** Convierte el contenido TipTap en fragmentos de texto de PptxGenJS (un párrafo por breakLine). */
function textRuns(content: JSONContent | undefined, defaults: { color: string; font: string; size: number; bold?: boolean; italic?: boolean; align?: string }): Run[] {
  const runs: Run[] = [];
  const para = (p: JSONContent, extra: Record<string, unknown>) => {
    const align = p.attrs?.textAlign as string | undefined;
    const pOpts: Record<string, unknown> = { ...extra };
    const effAlign = align ?? defaults.align;
    if (effAlign) pOpts.align = effAlign;
    const kids = p.content ?? [];
    if (!kids.length) {
      runs.push({ text: '', options: { ...pOpts, breakLine: true, fontSize: pt(defaults.size) } });
      return;
    }
    kids.forEach((n, i) => {
      if (n.type === 'hardBreak') {
        runs.push({ text: '', options: { ...pOpts, softBreakBefore: true } });
        return;
      }
      if (n.type !== 'text') return;
      const o: Record<string, unknown> = { ...pOpts };
      if (defaults.bold) o.bold = true;
      if (defaults.italic) o.italic = true;
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') o.bold = true;
        if (m.type === 'italic') o.italic = true;
        if (m.type === 'underline') o.underline = { style: 'sng' };
        if (m.type === 'strike') o.strike = 'sngStrike';
        if (m.type === 'textStyle') {
          const c = toHex6(m.attrs?.color as string);
          if (c) o.color = c;
          const fs = parseFloat(String(m.attrs?.fontSize ?? ''));
          if (fs) o.fontSize = pt(fs);
          const f = cleanFont(m.attrs?.fontFamily);
          if (f) o.fontFace = f;
        }
        if (m.type === 'highlight') o.highlight = toHex6(m.attrs?.color as string) ?? 'FFFF00';
        if (m.type === 'link') o.hyperlink = { url: m.attrs?.href };
      }
      if (!o.color) o.color = defaults.color;
      if (!o.fontFace) o.fontFace = defaults.font;
      if (!o.fontSize) o.fontSize = pt(defaults.size);
      if (i === kids.length - 1) o.breakLine = true;
      runs.push({ text: n.text ?? '', options: o });
    });
  };
  const walk = (n: JSONContent, level = 0) => {
    if (n.type === 'paragraph') para(n, {});
    else if (n.type === 'bulletList' || n.type === 'orderedList') {
      for (const li of n.content ?? []) {
        (li.content ?? []).forEach((c) => {
          if (c.type === 'paragraph') para(c, { bullet: n.type === 'orderedList' ? { type: 'number' } : true, indentLevel: level });
          else walk(c, level + 1);
        });
      }
    } else n.content?.forEach((c) => walk(c, level));
  };
  if (content) walk(content);
  // El último párrafo no necesita salto final
  if (runs.length) delete runs[runs.length - 1].options.breakLine;
  return runs;
}

async function imageData(src: string): Promise<{ data: string; w: number; h: number } | null> {
  if (!src.startsWith('data:')) return null;
  const { bytes, mime } = dataUrlToBytes(src);
  const size = imageSize(bytes);
  if (!size) return null;
  if (size.type === 'webp' || size.type === 'svg') {
    const png = await rasterizeToPng(src, size.width, size.height);
    return { data: `image/png;base64,${bytesToBase64(png)}`, w: size.width, h: size.height };
  }
  return { data: `${mime};base64,${bytesToBase64(bytes)}`, w: size.width, h: size.height };
}

async function background(bg: Background): Promise<Record<string, unknown>> {
  if (bg.type === 'solid') return { color: toHex6(bg.color) ?? 'FFFFFF' };
  if (bg.type === 'gradient') {
    // PptxGenJS no admite degradados de fondo: se exporta como imagen generada.
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const g = canvas.getContext('2d');
    if (!g) return { color: toHex6(bg.from) ?? 'FFFFFF' };
    const a = ((bg.angle - 90) * Math.PI) / 180;
    const cx = 480;
    const cy = 270;
    const r = Math.abs(480 * Math.cos(a)) + Math.abs(270 * Math.sin(a));
    const grad = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to);
    g.fillStyle = grad;
    g.fillRect(0, 0, 960, 540);
    return { data: canvas.toDataURL('image/png').replace(/^data:/, '') };
  }
  const img = await imageData(bg.src);
  return img ? { data: img.data } : { color: '000000' };
}

async function addElement(pptx: PptxGenJS, slide: PptxGenJS.Slide, el: SlideElement, pres: Presentation, warnings: Set<string>) {
  const box = { x: inch(el.x), y: inch(el.y), w: inch(Math.max(1, el.w)), h: inch(Math.max(1, el.h)), rotate: el.rotation || undefined };
  const transparency = el.opacity !== undefined && el.opacity < 1 ? Math.round((1 - el.opacity) * 100) : undefined;
  const defaults = { color: toHex6(pres.theme.colors.text) ?? '000000', font: cleanFont(pres.theme.fonts.body) ?? 'Arial', size: 24 };
  switch (el.type) {
    case 'text': {
      const f = el.style.font ?? {};
      const runs = textRuns(el.content, {
        color: toHex6(f.color) ?? defaults.color,
        font: cleanFont(f.family) ?? defaults.font,
        size: f.size ?? defaults.size,
        bold: f.bold,
        italic: f.italic,
        align: f.align,
      });
      slide.addText(runs.length ? (runs as PptxGenJS.TextProps[]) : '', {
        ...box,
        valign: el.style.vAlign === 'middle' ? 'middle' : el.style.vAlign === 'bottom' ? 'bottom' : 'top',
        margin: pt(el.style.padding ?? 8),
        fill: el.style.fill ? { color: toHex6(el.style.fill) ?? undefined, transparency } : undefined,
        line: el.style.stroke ? { color: toHex6(el.style.stroke) ?? undefined, width: pt(el.style.strokeWidth ?? 1) } : undefined,
        fit: 'none',
        wrap: true,
      });
      break;
    }
    case 'shape': {
      const fill = el.fill ? { color: toHex6(el.fill) ?? undefined, transparency } : { type: 'none' as const };
      const line = el.stroke && el.strokeWidth ? { color: toHex6(el.stroke) ?? undefined, width: pt(el.strokeWidth) } : { type: 'none' as const };
      const kind = SHAPE_MAP[el.shape];
      const runs = el.content ? textRuns(el.content, { ...defaults, size: 20 }) : null;
      const opts: Record<string, unknown> = { ...box, fill, line, valign: el.vAlign ?? 'middle', align: 'center' };
      if (el.shape === 'roundRect') opts.rectRadius = 0.16;
      if (!kind) {
        // Pentágono regular: geometría personalizada
        const pts = [[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]].map(([x, y]) => ({ x: box.w * x, y: box.h * y }));
        opts.points = [...pts, { close: true }];
        slide.addText(runs?.length ? (runs as PptxGenJS.TextProps[]) : '', { ...opts, shape: 'custGeom' as PptxGenJS.ShapeType });
      } else if (runs?.length) {
        slide.addText(runs as PptxGenJS.TextProps[], { ...opts, shape: kind as PptxGenJS.ShapeType });
      } else {
        slide.addShape(kind as PptxGenJS.ShapeType, opts);
      }
      break;
    }
    case 'line':
      slide.addShape('line' as PptxGenJS.ShapeType, {
        ...box,
        flipH: !!el.flipH,
        flipV: !!el.flipV,
        line: {
          color: toHex6(el.stroke) ?? '000000',
          width: pt(el.strokeWidth),
          dashType: el.dash === 'dash' ? 'dash' : el.dash === 'dot' ? 'sysDot' : 'solid',
          beginArrowType: el.arrowStart ? 'triangle' : undefined,
          endArrowType: el.arrowEnd ? 'triangle' : undefined,
        },
      });
      break;
    case 'image': {
      const img = await imageData(el.src);
      if (!img) {
        warnings.add('Algunas imágenes no se pudieron exportar.');
        break;
      }
      const sizing = el.fit === 'fill' ? undefined : { type: el.fit === 'cover' ? ('cover' as const) : ('contain' as const), w: box.w, h: box.h };
      slide.addImage({ data: img.data, ...box, sizing, altText: el.alt || undefined, rounding: !!el.radius && el.radius >= Math.min(el.w, el.h) / 2, transparency } as PptxGenJS.ImageProps);
      break;
    }
    case 'table': {
      const rows = el.rows.map((row, r) =>
        row.map((cell) => {
          const header = el.headerRow && r === 0;
          return {
            text: cell.text,
            options: {
              bold: cell.bold || header,
              color: toHex6(cell.color ?? (header ? '#ffffff' : pres.theme.colors.text)) ?? undefined,
              fill: cell.fill || header ? { color: toHex6(cell.fill ?? el.headerFill) ?? undefined } : undefined,
              align: cell.align,
              fontSize: pt(el.fontSize),
              fontFace: defaults.font,
            },
          };
        }),
      );
      slide.addTable(rows as PptxGenJS.TableRow[], {
        x: box.x,
        y: box.y,
        w: box.w,
        colW: el.colWidths.map((f) => Math.round(box.w * f * 10000) / 10000),
        rowH: Array(el.rows.length).fill(Math.round((box.h / Math.max(1, el.rows.length)) * 10000) / 10000),
        border: { type: 'solid', pt: 0.75, color: toHex6(el.borderColor) ?? '999999' },
        valign: 'middle',
      });
      break;
    }
  }
  void pptx;
}

/** Exporta a PPTX. Las animaciones y transiciones no se incluyen (PptxGenJS no las admite). */
export async function exportPptx(pres: Presentation, title = 'Presentación'): Promise<{ blob: Blob; warnings: string[] }> {
  const warnings = new Set<string>();
  const pptx = new PptxGenJS();
  pptx.author = BRAND.apps.presentation.name;
  pptx.company = BRAND.suiteName;
  pptx.title = title;
  pptx.defineLayout({ name: 'ROUNDED', width: inch(pres.size.width), height: inch(pres.size.height) });
  pptx.layout = 'ROUNDED';
  for (const s of pres.slides) {
    const slide = pptx.addSlide();
    slide.background = (await background(s.background ?? pres.theme.background)) as PptxGenJS.BackgroundProps;
    if (s.hidden) slide.hidden = true;
    for (const el of s.elements) await addElement(pptx, slide, el, pres, warnings);
    if (s.notes) slide.addNotes(s.notes);
    if (s.elements.some((e) => e.animation)) warnings.add('Las animaciones de entrada no se exportan a PPTX.');
    if (s.transition && s.transition.type !== 'none') warnings.add('Las transiciones entre diapositivas no se exportan a PPTX.');
  }
  const out = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), warnings: Array.from(warnings) };
}
