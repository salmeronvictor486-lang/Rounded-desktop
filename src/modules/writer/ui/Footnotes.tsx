import { useEditorState, type Editor } from '@tiptap/react';
import { promptDialog } from '@/ui/dialogs';

interface NoteItem {
  pos: number;
  text: string;
  kind: string;
}

export async function editFootnote(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'footnote') return;
  const text = await promptDialog({ title: node.attrs.kind === 'endnote' ? 'Editar nota final' : 'Editar nota al pie', defaultValue: node.attrs.text, confirmLabel: 'Guardar' });
  if (text !== null) editor.chain().focus().updateFootnote(pos, text).run();
}

/** Lista de notas al pie y notas finales, numeradas en orden de aparición. */
export function FootnotesList({ editor }: { editor: Editor }) {
  const notes = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list: NoteItem[] = [];
      e.state.doc.descendants((n, pos) => {
        if (n.type.name === 'footnote') list.push({ pos, text: n.attrs.text, kind: n.attrs.kind });
      });
      return list;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  if (!notes.length) return null;
  const foot = notes.map((n, i) => ({ ...n, n: i + 1 })).filter((n) => n.kind !== 'endnote');
  const end = notes.map((n, i) => ({ ...n, n: i + 1 })).filter((n) => n.kind === 'endnote');
  const render = (items: typeof foot, title: string) =>
    items.length ? (
      <section className="doc-notes" aria-label={title}>
        <div className="doc-notes-title">{title}</div>
        <ol>
          {items.map((n) => (
            <li key={n.pos} value={n.n}>
              <button type="button" className="note-link" onClick={() => void editFootnote(editor, n.pos)} title="Editar nota">
                {n.text || <em className="faint">(nota vacía)</em>}
              </button>
            </li>
          ))}
        </ol>
      </section>
    ) : null;
  return (
    <div contentEditable={false}>
      {render(foot, 'Notas al pie')}
      {render(end, 'Notas finales')}
    </div>
  );
}
