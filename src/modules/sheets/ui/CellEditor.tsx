import { useEffect, useLayoutEffect, useRef } from 'react';
import { FUNCTION_NAMES } from '../engine/functions';

export interface EditState {
  r: number;
  c: number;
  value: string;
  /** "enter": las flechas confirman y mueven; "edit": mueven el cursor del texto. */
  mode: 'enter' | 'edit';
}

interface Props {
  edit: EditState;
  rect: { left: number; top: number; width: number; height: number };
  style: React.CSSProperties;
  onChange: (v: string) => void;
  onCommit: (move: { dr: number; dc: number } | null, opts?: { fillSelection?: boolean }) => void;
  onCancel: () => void;
  onModeEdit: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** Sugerencia de función mientras se escribe una fórmula: =SU → SUM, SUMIF... */
export function functionHint(value: string, caret: number): string[] {
  if (!value.startsWith('=')) return [];
  const before = value.slice(0, caret);
  const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  if (!m || m[1].length < 2) return [];
  const prefix = m[1].toUpperCase();
  return FUNCTION_NAMES.filter((n) => n.startsWith(prefix)).slice(0, 6);
}

export function CellEditor({ edit, rect, style, onChange, onCommit, onCancel, onModeEdit, inputRef }: Props) {
  const ta = inputRef;
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    // Solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.r, edit.c]);

  const sizer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ta.current;
    const s = sizer.current;
    if (!el || !s) return;
    s.textContent = `${edit.value} `;
    el.style.width = `${Math.max(rect.width, Math.min(600, s.offsetWidth + 16))}px`;
    el.style.height = `${Math.max(rect.height, s.offsetHeight + 4)}px`;
  }, [edit.value, rect.width, rect.height, ta]);

  const hints = functionHint(edit.value, ta.current?.selectionStart ?? edit.value.length);

  return (
    <>
      <div ref={sizer} className="cell-editor-sizer" style={{ ...style, maxWidth: 600 }} aria-hidden="true" />
      <textarea
        ref={ta}
        className="cell-editor"
        aria-label="Editar celda"
        spellCheck={false}
        value={edit.value}
        style={{ ...style, left: rect.left, top: rect.top, minWidth: rect.width, minHeight: rect.height }}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={() => onModeEdit()}
        onKeyDown={(e) => {
          const k = e.key;
          if (k === 'Enter' && e.altKey) {
            e.preventDefault();
            const el = e.currentTarget;
            const pos = el.selectionStart;
            const v = edit.value.slice(0, pos) + '\n' + edit.value.slice(el.selectionEnd);
            onChange(v);
            requestAnimationFrame(() => el.setSelectionRange(pos + 1, pos + 1));
            return;
          }
          if (k === 'Enter') {
            e.preventDefault();
            onCommit({ dr: e.shiftKey ? -1 : 1, dc: 0 }, { fillSelection: e.ctrlKey || e.metaKey });
          } else if (k === 'Tab') {
            e.preventDefault();
            if (hints.length && edit.value.startsWith('=')) {
              const el = e.currentTarget;
              const caret = el.selectionStart;
              const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(edit.value.slice(0, caret))!;
              const v = edit.value.slice(0, caret - m[1].length) + hints[0] + '(' + edit.value.slice(caret);
              onChange(v);
              const pos = caret - m[1].length + hints[0].length + 1;
              requestAnimationFrame(() => el.setSelectionRange(pos, pos));
              return;
            }
            onCommit({ dr: 0, dc: e.shiftKey ? -1 : 1 });
          } else if (k === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (edit.mode === 'enter' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !edit.value.startsWith('=')) {
            e.preventDefault();
            onCommit({ dr: k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0, dc: k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0 });
          } else if (k === 'F2') {
            e.preventDefault();
            onModeEdit();
          } else if (k === 'F4') {
            e.preventDefault();
            const el = e.currentTarget;
            const caret = el.selectionStart;
            const next = toggleAbsolute(edit.value, caret);
            if (next) {
              onChange(next.value);
              requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
            }
          }
        }}
      />
      {hints.length > 0 && (
        <div className="fn-hints" style={{ left: rect.left, top: rect.top + rect.height + 2 }} role="listbox" aria-label="Funciones sugeridas">
          {hints.map((h, i) => (
            <div key={h} className={`fn-hint ${i === 0 ? 'is-first' : ''}`} role="option" aria-selected={i === 0}>
              {h}
              {i === 0 && <span className="faint"> — Tab para completar</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** F4: alterna A1 → $A$1 → A$1 → $A1 → A1 en la referencia bajo el cursor. */
export function toggleAbsolute(value: string, caret: number): { value: string; caret: number } | null {
  const re = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    const start = m.index;
    const end = start + m[0].length;
    if (caret >= start && caret <= end) {
      const [absC, absR] = [!!m[1], !!m[3]];
      const next = !absC && !absR ? [true, true] : absC && absR ? [false, true] : !absC && absR ? [true, false] : [false, false];
      const text = `${next[0] ? '$' : ''}${m[2]}${next[1] ? '$' : ''}${m[4]}`;
      return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
    }
  }
  return null;
}
