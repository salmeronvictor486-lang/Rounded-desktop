import type { JSONContent } from '@tiptap/core';

type Mark = { type: string; attrs?: Record<string, unknown> };

function walkText(n: JSONContent, fn: (t: JSONContent) => void) {
  if (n.type === 'text') fn(n);
  n.content?.forEach((c) => walkText(c, fn));
}

function walkParagraphs(n: JSONContent, fn: (p: JSONContent) => void) {
  if (n.type === 'paragraph') fn(n);
  n.content?.forEach((c) => walkParagraphs(c, fn));
}

/** ¿Todo el texto tiene la marca? */
export function allHaveMark(content: JSONContent | undefined, type: string): boolean {
  if (!content) return false;
  let any = false;
  let all = true;
  walkText(content, (t) => {
    any = true;
    if (!(t.marks ?? []).some((m) => m.type === type)) all = false;
  });
  return any && all;
}

/** Activa o desactiva una marca (negrita, cursiva...) en todo el texto. */
export function setMarkAll(content: JSONContent, type: string, on: boolean): JSONContent {
  const c = structuredClone(content);
  walkText(c, (t) => {
    const marks = (t.marks ?? []).filter((m) => m.type !== type) as Mark[];
    if (on) marks.push({ type });
    t.marks = marks.length ? marks : undefined;
  });
  return c;
}

/** Fija atributos de estilo de texto (color, tamaño, fuente) en todo el texto. */
export function setTextStyleAll(content: JSONContent, attrs: Record<string, string | null>): JSONContent {
  const c = structuredClone(content);
  walkText(c, (t) => {
    const marks = (t.marks ?? []) as Mark[];
    let ts = marks.find((m) => m.type === 'textStyle');
    if (!ts) {
      ts = { type: 'textStyle', attrs: {} };
      marks.push(ts);
    }
    ts.attrs = { ...(ts.attrs ?? {}), ...attrs };
    t.marks = marks;
  });
  return c;
}

export function setAlignAll(content: JSONContent, align: 'left' | 'center' | 'right' | 'justify'): JSONContent {
  const c = structuredClone(content);
  walkParagraphs(c, (p) => {
    p.attrs = { ...(p.attrs ?? {}), textAlign: align };
  });
  return c;
}

/** Primer valor de un atributo de textStyle (para mostrar en la barra). */
export function firstTextStyle(content: JSONContent | undefined, attr: string): string | null {
  let found: string | null = null;
  if (!content) return null;
  walkText(content, (t) => {
    if (found) return;
    const ts = (t.marks ?? []).find((m) => m.type === 'textStyle');
    const v = ts?.attrs?.[attr];
    if (typeof v === 'string' && v) found = v;
  });
  return found;
}

export function firstAlign(content: JSONContent | undefined): string | null {
  let found: string | null = null;
  if (!content) return null;
  walkParagraphs(content, (p) => {
    if (!found && p.attrs?.textAlign) found = p.attrs.textAlign as string;
  });
  return found;
}

/** Escala los tamaños de letra (al cambiar el tamaño de la diapositiva). */
export function scaleFontSizes(content: JSONContent, factor: number): JSONContent {
  const c = structuredClone(content);
  walkText(c, (t) => {
    const ts = (t.marks ?? []).find((m) => m.type === 'textStyle');
    const fs = ts?.attrs?.fontSize;
    if (typeof fs === 'string' && fs.endsWith('px')) ts!.attrs!.fontSize = `${Math.round(parseFloat(fs) * factor)}px`;
  });
  return c;
}

/** Quita un atributo de textStyle de todo el texto (para que mande el formato del cuadro). */
export function clearTextStyleAttr(content: JSONContent, attr: string): JSONContent {
  const c = structuredClone(content);
  walkText(c, (t) => {
    const ts = (t.marks ?? []).find((m) => m.type === 'textStyle');
    if (ts?.attrs) ts.attrs[attr] = null;
  });
  return c;
}

export function clearAlign(content: JSONContent): JSONContent {
  const c = structuredClone(content);
  walkParagraphs(c, (p) => {
    if (p.attrs) p.attrs.textAlign = null;
  });
  return c;
}
