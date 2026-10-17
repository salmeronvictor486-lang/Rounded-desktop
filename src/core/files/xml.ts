import { SecurityError, FileFormatError } from './errors';

/**
 * Analiza XML de forma segura. El DOMParser del navegador nunca resuelve
 * entidades externas, pero además rechazamos cualquier DOCTYPE para evitar
 * expansión de entidades internas ("billion laughs").
 */
export function parseXml(text: string, what = 'XML'): Document {
  if (/<!DOCTYPE/i.test(text.slice(0, 4096)) || /<!ENTITY/i.test(text)) {
    throw new SecurityError(`El ${what} contiene declaraciones DOCTYPE/ENTITY, que no se admiten por seguridad.`);
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new FileFormatError(`El ${what} está mal formado.`, err.textContent ?? undefined);
  return doc;
}

/** Hijos elemento con un nombre local concreto (independiente del prefijo de espacio de nombres). */
export function children(el: Element | Document | null | undefined, localName?: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  const kids = (el as Element).children ?? [];
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (!localName || k.localName === localName) out.push(k);
  }
  return out;
}

export function child(el: Element | Document | null | undefined, localName: string): Element | null {
  if (!el) return null;
  const kids = (el as Element).children;
  if (!kids) return null;
  for (let i = 0; i < kids.length; i++) if (kids[i].localName === localName) return kids[i];
  return null;
}

/** Recorre un camino de nombres locales: path(el, 'pPr', 'jc'). */
export function path(el: Element | null | undefined, ...names: string[]): Element | null {
  let cur: Element | null = el ?? null;
  for (const n of names) {
    if (!cur) return null;
    cur = child(cur, n);
  }
  return cur;
}

/** Descendientes con nombre local (búsqueda en profundidad). */
export function descendants(el: Element | Document | null | undefined, localName: string): Element[] {
  if (!el) return [];
  const all = (el as Element).getElementsByTagNameNS('*', localName);
  return Array.from(all);
}

/** Atributo por nombre local (ignora el prefijo: w:val, r:id...). */
export function attr(el: Element | null | undefined, localName: string): string | null {
  if (!el) return null;
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.localName === localName) return a.value;
  }
  return null;
}

export function attrNum(el: Element | null | undefined, localName: string): number | null {
  const v = attr(el, localName);
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta valores booleanos OOXML (w:b, w:b w:val="0"/"false"/"off"). */
export function onOff(el: Element | null | undefined): boolean | null {
  if (!el) return null;
  const v = attr(el, 'val');
  if (v == null) return true;
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}
