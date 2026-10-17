import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (text: string, kind?: 'footnote' | 'endnote') => ReturnType;
      updateFootnote: (pos: number, text: string) => ReturnType;
    };
  }
}

/**
 * Nota al pie o nota final. Se guarda en línea (atributo `text`) y se
 * numera automáticamente; la lista de notas se muestra al final del documento
 * y se exporta como notas reales de Word (DOCX).
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: { default: '', parseHTML: (el) => el.getAttribute('data-footnote') ?? el.getAttribute('title') ?? '' },
      kind: { default: 'footnote', parseHTML: (el) => (el.getAttribute('data-kind') === 'endnote' ? 'endnote' : 'footnote') },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        'data-footnote': node.attrs.text,
        'data-kind': node.attrs.kind,
        class: node.attrs.kind === 'endnote' ? 'footnote-ref endnote-ref' : 'footnote-ref',
        title: node.attrs.text,
      }),
    ];
  },

  renderText({ node }) {
    return ` [${node.attrs.text}]`;
  },

  addCommands() {
    return {
      insertFootnote:
        (text, kind = 'footnote') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { text, kind } }),
      updateFootnote:
        (pos, text) =>
        ({ tr, dispatch, state }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== this.name) return false;
          if (dispatch) dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, text }));
          return true;
        },
    };
  },
});
