import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TextStyle, Color, FontFamily, FontSize, BackgroundColor } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { isSafeLinkHref } from '@/core/files/validate';
import { ParagraphFormat } from './paragraphFormat';
import { PageBreak } from './pageBreak';
import { Footnote } from './footnote';
import { TableOfContents } from './toc';
import { SearchReplace } from './searchReplace';
import { DocImage } from './image';
import { DocTable, DocTableCell, DocTableHeader, DocTableRow } from './table';

/**
 * Esquema del documento de Rounded Scribe. El mismo conjunto de extensiones se
 * usa en el editor, en las vistas previas y en la conversión HTML ↔ JSON, para
 * que todos interpreten el documento igual.
 */
export function buildExtensions(opts: { placeholder?: string; editor?: boolean } = {}): AnyExtension[] {
  const exts: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto', 'tel'],
        isAllowedUri: (url) => isSafeLinkHref(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
      undoRedo: opts.editor === false ? false : { depth: 200 },
      dropcursor: { color: 'var(--accent)', width: 2 },
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    BackgroundColor,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    ParagraphFormat,
    PageBreak,
    Footnote,
    TableOfContents,
    DocImage,
    DocTable,
    DocTableRow,
    DocTableHeader,
    DocTableCell,
  ];
  if (opts.editor !== false) {
    exts.push(
      CharacterCount,
      SearchReplace,
      Placeholder.configure({ placeholder: opts.placeholder ?? 'Empieza a escribir…', showOnlyWhenEditable: true }),
    );
  }
  return exts;
}

let cached: AnyExtension[] | null = null;
/** Extensiones sin plugins de edición (para conversiones y vistas previas). */
export function schemaExtensions(): AnyExtension[] {
  if (!cached) cached = buildExtensions({ editor: false });
  return cached;
}
