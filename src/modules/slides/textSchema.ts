import { generateHTML, type AnyExtension, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { isSafeLinkHref } from '@/core/files/validate';

/** Esquema de texto de las diapositivas (más reducido que el del procesador de textos). */
export function slideTextExtensions(opts: { editor?: boolean } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      code: false,
      trailingNode: false,
      undoRedo: opts.editor ? { depth: 100 } : false,
      link: { openOnClick: false, isAllowedUri: (u) => isSafeLinkHref(u) },
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
  ];
}

let exts: AnyExtension[] | null = null;
const cache = new WeakMap<object, string>();

/** HTML del contenido (memorizado por objeto). El esquema descarta cualquier nodo no permitido. */
export function slideTextHtml(content: JSONContent | undefined): string {
  if (!content) return '';
  const hit = cache.get(content);
  if (hit !== undefined) return hit;
  if (!exts) exts = slideTextExtensions();
  let html = '';
  try {
    html = generateHTML(content, exts);
  } catch {
    html = '';
  }
  cache.set(content, html);
  return html;
}
