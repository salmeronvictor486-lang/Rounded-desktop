import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setLineHeight: (value: number | null) => ReturnType;
      setParagraphSpacing: (spacing: { before?: number | null; after?: number | null }) => ReturnType;
      setFirstLineIndent: (px: number | null) => ReturnType;
    };
  }
}

/** Ancho de un nivel de sangría (1,27 cm, como en Word). */
export const INDENT_STEP_PX = 48;
export const MAX_INDENT = 10;

const TYPES = ['paragraph', 'heading'];

/**
 * Atributos de formato de párrafo: sangría, sangría de primera línea,
 * interlineado y espaciado anterior/posterior (en puntos).
 */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const ml = parseFloat((el as HTMLElement).style.marginLeft || '0');
              const data = Number(el.getAttribute('data-indent') || 0);
              return data || Math.min(MAX_INDENT, Math.round(ml / INDENT_STEP_PX)) || 0;
            },
            renderHTML: (attrs) =>
              attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left:${attrs.indent * INDENT_STEP_PX}px` } : {},
          },
          firstLineIndent: {
            default: null,
            parseHTML: (el) => {
              const v = parseFloat((el as HTMLElement).style.textIndent || '');
              return Number.isFinite(v) && v !== 0 ? v : null;
            },
            renderHTML: (attrs) => (attrs.firstLineIndent ? { style: `text-indent:${attrs.firstLineIndent}px` } : {}),
          },
          lineHeight: {
            default: null,
            parseHTML: (el) => {
              const v = parseFloat((el as HTMLElement).style.lineHeight || '');
              return Number.isFinite(v) && v > 0 && v < 5 ? v : null;
            },
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {}),
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => {
              const v = (el as HTMLElement).style.marginTop;
              return v && v.endsWith('pt') ? parseFloat(v) : null;
            },
            renderHTML: (attrs) => (attrs.spaceBefore != null ? { style: `margin-top:${attrs.spaceBefore}pt` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => {
              const v = (el as HTMLElement).style.marginBottom;
              return v && v.endsWith('pt') ? parseFloat(v) : null;
            },
            renderHTML: (attrs) => (attrs.spaceAfter != null ? { style: `margin-bottom:${attrs.spaceAfter}pt` } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    const update =
      (fn: (attrs: Record<string, any>) => Record<string, any>) =>
      () =>
      ({ tr, state, dispatch }: any) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (TYPES.includes(node.type.name)) {
            const next = fn(node.attrs);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next });
            changed = true;
            return false;
          }
          return true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return {
      indent: update((a) => ({ indent: Math.min(MAX_INDENT, (a.indent || 0) + 1) })),
      outdent: update((a) => ({ indent: Math.max(0, (a.indent || 0) - 1) })),
      setLineHeight: (value) => update(() => ({ lineHeight: value }))(),
      setFirstLineIndent: (px) => update(() => ({ firstLineIndent: px }))(),
      setParagraphSpacing:
        ({ before, after }) =>
          update((a) => ({
            spaceBefore: before === undefined ? a.spaceBefore : before,
            spaceAfter: after === undefined ? a.spaceAfter : after,
          }))(),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const ed = this.editor;
        if (ed.isActive('listItem')) return ed.commands.sinkListItem('listItem');
        if (ed.isActive('tableCell') || ed.isActive('tableHeader')) return false;
        const { $from, empty } = ed.state.selection;
        // Al principio del párrafo (o con selección) Tab aumenta la sangría; en otro caso inserta una tabulación.
        if (!empty || $from.parentOffset === 0) return ed.commands.indent();
        return ed.commands.insertContent('\t');
      },
      'Shift-Tab': () => {
        const ed = this.editor;
        if (ed.isActive('listItem')) return ed.commands.liftListItem('listItem');
        if (ed.isActive('tableCell') || ed.isActive('tableHeader')) return false;
        return ed.commands.outdent();
      },
    };
  },
});
