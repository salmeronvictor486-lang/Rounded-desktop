import type { DocumentStyles, TextStyleDef } from './model';

function defCss(d: TextStyleDef | undefined): string {
  if (!d) return '';
  const out: string[] = [];
  if (d.fontFamily) out.push(`font-family: "${d.fontFamily.replace(/"/g, '')}", Carlito, Calibri, sans-serif`);
  if (d.fontSize) out.push(`font-size: ${d.fontSize}pt`);
  if (d.color) out.push(`color: ${d.color}`);
  if (d.bold !== undefined) out.push(`font-weight: ${d.bold ? 700 : 400}`);
  if (d.italic) out.push('font-style: italic');
  return out.join('; ');
}

/** CSS de los estilos de documento (importados de Word u ODT) aplicado bajo un selector. */
export function documentStyleCss(styles: DocumentStyles | undefined, scope: string): string {
  if (!styles) return '';
  let css = '';
  const body = styles.body;
  if (body) {
    const extra: string[] = [];
    if (body.lineHeight) extra.push(`line-height: ${body.lineHeight}`);
    css += `${scope} { ${[defCss(body), ...extra].filter(Boolean).join('; ')} }\n`;
    if (body.spaceAfter != null) css += `${scope} p { margin-bottom: ${body.spaceAfter}pt }\n`;
  }
  for (const [lvl, def] of Object.entries(styles.headings ?? {})) {
    const c = defCss(def);
    if (c) css += `${scope} h${lvl} { ${c} }\n`;
  }
  return css;
}
