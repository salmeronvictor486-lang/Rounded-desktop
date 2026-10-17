import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: { insertTableOfContents: () => ReturnType };
  }
}

export interface TocEntry {
  level: number;
  text: string;
  /** Posición del título en el documento (solo en el editor). */
  pos?: number;
  /** Índice del título dentro del documento (para marcadores). */
  index: number;
}

export function collectHeadings(doc: PMNode, maxLevel = 3): TocEntry[] {
  const out: TocEntry[] = [];
  let index = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      if (node.attrs.level <= maxLevel && node.textContent.trim()) out.push({ level: node.attrs.level, text: node.textContent, pos, index });
      index++;
      return false;
    }
    return true;
  });
  return out;
}

/** Igual que collectHeadings pero sobre JSON (exportadores). */
export function collectHeadingsJson(doc: JSONContent, maxLevel = 3): TocEntry[] {
  const out: TocEntry[] = [];
  let index = 0;
  const text = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(text).join('');
  const walk = (n: JSONContent) => {
    if (n.type === 'heading') {
      const level = Number(n.attrs?.level ?? 1);
      const t = text(n);
      if (level <= maxLevel && t.trim()) out.push({ level, text: t, index });
      index++;
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

/** Índice (tabla de contenido) que se actualiza automáticamente al editar los títulos. */
export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      maxLevel: { default: 3, parseHTML: (el) => Number(el.getAttribute('data-max-level') || 3) },
      title: { default: 'Índice', parseHTML: (el) => el.getAttribute('data-title') || 'Índice' },
    };
  },

  parseHTML() {
    return [{ tag: 'nav[data-toc]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['nav', mergeAttributes(HTMLAttributes, { 'data-toc': '', 'data-max-level': node.attrs.maxLevel, 'data-title': node.attrs.title, class: 'toc' })];
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name }, { type: 'paragraph' }]),
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('nav');
      dom.className = 'toc';
      dom.setAttribute('contenteditable', 'false');
      dom.setAttribute('aria-label', 'Índice');
      let current = node;
      const render = (ed: Editor) => {
        const entries = collectHeadings(ed.state.doc, current.attrs.maxLevel);
        dom.replaceChildren();
        const title = document.createElement('div');
        title.className = 'toc-title';
        title.textContent = current.attrs.title;
        dom.appendChild(title);
        if (!entries.length) {
          const empty = document.createElement('div');
          empty.className = 'toc-empty';
          empty.textContent = 'Añade títulos (Título 1, 2 o 3) para generar el índice.';
          dom.appendChild(empty);
        }
        for (const e of entries) {
          const a = document.createElement('button');
          a.type = 'button';
          a.className = `toc-entry toc-level-${e.level}`;
          a.textContent = e.text;
          a.addEventListener('mousedown', (ev) => ev.preventDefault());
          a.addEventListener('click', () => {
            const el = ed.view.nodeDOM(e.pos!) as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            ed.commands.setTextSelection(e.pos! + 1);
          });
          dom.appendChild(a);
        }
      };
      const onUpdate = () => render(editor);
      editor.on('update', onUpdate);
      render(editor);
      void getPos;
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'tableOfContents') return false;
          current = n;
          render(editor);
          return true;
        },
        destroy: () => editor.off('update', onUpdate),
        ignoreMutation: () => true,
      };
    };
  },
});
