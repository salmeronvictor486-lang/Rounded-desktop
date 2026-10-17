import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';

/** Devuelve la vista de ProseMirror cuando el editor ya está montado en el DOM (en TipTap 3 puede no estarlo aún). */
export function useEditorView(editor: Editor | null): EditorView | null {
  const [view, setView] = useState<EditorView | null>(null);
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      try {
        const v = editor.view;
        // En TipTap 3, `view` es un proxy que lanza un error si aún no está montado.
        if (!v.dom) throw new Error('sin montar');
        setView(v);
      } catch {
        setView(null);
      }
    };
    check();
    editor.on('mount', check);
    editor.on('create', check);
    editor.on('unmount', () => setView(null));
    return () => {
      editor.off('mount', check);
      editor.off('create', check);
    };
  }, [editor]);
  return view;
}
