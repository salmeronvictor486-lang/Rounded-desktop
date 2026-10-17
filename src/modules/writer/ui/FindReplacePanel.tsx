import { useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button, IconButton } from '@/ui/Button';

export function FindReplacePanel({ editor, onClose, focusReplace }: { editor: Editor; onClose: () => void; focusReplace?: boolean }) {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [wholeWord, setWhole] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);
  const replRef = useRef<HTMLInputElement>(null);
  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const st = e.storage.searchReplace;
      return { count: st?.matches.length ?? 0, index: st?.index ?? -1 };
    },
  });

  useEffect(() => {
    (focusReplace ? replRef : findRef).current?.focus();
  }, [focusReplace]);

  useEffect(() => {
    editor.commands.setSearch({ term, caseSensitive, wholeWord });
  }, [editor, term, caseSensitive, wholeWord]);

  useEffect(() => () => void editor.commands.clearSearch(), [editor]);

  return (
    <aside className="side-panel" aria-label="Buscar y reemplazar" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="row" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Buscar y reemplazar</h3>
        <div className="spacer" />
        <IconButton icon={X} label="Cerrar" onClick={onClose} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="find-term">Buscar</label>
        <input ref={findRef} id="find-term" className="input" value={term} onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) editor.commands.previousMatch();
              else editor.commands.nextMatch();
            }
          }} />
        <div className="row" style={{ marginTop: 6 }}>
          <span className="muted" aria-live="polite">{term ? (info.count ? `${info.index + 1} de ${info.count}` : 'Sin resultados') : ''}</span>
          <div className="spacer" />
          <IconButton icon={ChevronUp} label="Anterior (Mayús+Intro)" disabled={!info.count} onClick={() => editor.commands.previousMatch()} />
          <IconButton icon={ChevronDown} label="Siguiente (Intro)" disabled={!info.count} onClick={() => editor.commands.nextMatch()} />
        </div>
      </div>
      <div className="stack" style={{ marginBottom: 14 }}>
        <label className="checkbox"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCase(e.target.checked)} /> Coincidir mayúsculas y minúsculas</label>
        <label className="checkbox"><input type="checkbox" checked={wholeWord} onChange={(e) => setWhole(e.target.checked)} /> Solo palabras completas</label>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="replace-term">Reemplazar por</label>
        <input ref={replRef} id="replace-term" className="input" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
      </div>
      <div className="row">
        <Button size="sm" disabled={!info.count} onClick={() => {
          if (info.index < 0) editor.commands.nextMatch();
          editor.commands.replaceCurrent(replacement);
          editor.commands.nextMatch();
        }}>Reemplazar</Button>
        <Button size="sm" variant="primary" disabled={!info.count} onClick={() => editor.commands.replaceAll(replacement)}>Reemplazar todo</Button>
      </div>
    </aside>
  );
}
