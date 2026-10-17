import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Dialog } from './Dialog';
import { Button } from './Button';

type Request =
  | { kind: 'confirm'; id: number; title: string; message: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; id: number; title: string; message?: string; defaultValue?: string; confirmLabel?: string; resolve: (v: string | null) => void }
  | { kind: 'alert'; id: number; title: string; message: string; resolve: () => void }
  | {
      kind: 'choice';
      id: number;
      title: string;
      message: string;
      choices: { value: string; label: string; variant?: 'primary' | 'secondary' | 'danger' }[];
      resolve: (v: string | null) => void;
    };

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

interface DialogState {
  queue: Request[];
  push: (r: Request) => void;
  shift: () => void;
}

const useDialogStore = create<DialogState>((set) => ({
  queue: [],
  push: (r) => set((s) => ({ queue: [...s.queue, r] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

let nextId = 1;
function enqueue<T>(r: DistributiveOmit<Request, 'id' | 'resolve'>): Promise<T> {
  return new Promise<T>((resolve) => {
    useDialogStore.getState().push({ ...(r as any), id: nextId++, resolve });
  });
}

/** Pide confirmación (para operaciones destructivas usar danger: true). */
export function confirmDialog(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return enqueue<boolean>({ kind: 'confirm', ...opts });
}

export function promptDialog(opts: { title: string; message?: string; defaultValue?: string; confirmLabel?: string }): Promise<string | null> {
  return enqueue<string | null>({ kind: 'prompt', ...opts });
}

export function alertDialog(opts: { title: string; message: string }): Promise<void> {
  return enqueue<void>({ kind: 'alert', ...opts });
}

export function choiceDialog(opts: {
  title: string;
  message: string;
  choices: { value: string; label: string; variant?: 'primary' | 'secondary' | 'danger' }[];
}): Promise<string | null> {
  return enqueue<string | null>({ kind: 'choice', ...opts });
}

export function DialogHost() {
  const current = useDialogStore((s) => s.queue[0]);
  const shift = useDialogStore((s) => s.shift);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.defaultValue ?? '');
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [current]);

  if (!current) return null;
  const done = (fn: () => void) => {
    fn();
    shift();
  };

  if (current.kind === 'confirm') {
    return (
      <Dialog open title={current.title} onClose={() => done(() => current.resolve(false))}>
        <p className="dialog-message">{current.message}</p>
        <div className="dialog-footer">
          <Button onClick={() => done(() => current.resolve(false))}>Cancelar</Button>
          <Button autoFocus variant={current.danger ? 'danger' : 'primary'} onClick={() => done(() => current.resolve(true))}>
            {current.confirmLabel ?? 'Aceptar'}
          </Button>
        </div>
      </Dialog>
    );
  }
  if (current.kind === 'prompt') {
    return (
      <Dialog open title={current.title} onClose={() => done(() => current.resolve(null))}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            done(() => current.resolve(value));
          }}
        >
          {current.message && <label className="field-label" htmlFor="prompt-input">{current.message}</label>}
          <input
            id="prompt-input"
            ref={inputRef}
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={current.message ?? current.title}
          />
          <div className="dialog-footer">
            <Button onClick={() => done(() => current.resolve(null))}>Cancelar</Button>
            <Button type="submit" variant="primary">
              {current.confirmLabel ?? 'Aceptar'}
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }
  if (current.kind === 'choice') {
    return (
      <Dialog open title={current.title} onClose={() => done(() => current.resolve(null))}>
        <p className="dialog-message">{current.message}</p>
        <div className="dialog-footer">
          {current.choices.map((c, i) => (
            <Button key={c.value} autoFocus={i === current.choices.length - 1} variant={c.variant ?? 'secondary'} onClick={() => done(() => current.resolve(c.value))}>
              {c.label}
            </Button>
          ))}
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog open title={current.title} onClose={() => done(() => current.resolve())}>
      <p className="dialog-message" style={{ whiteSpace: 'pre-wrap' }}>{current.message}</p>
      <div className="dialog-footer">
        <Button autoFocus variant="primary" onClick={() => done(() => current.resolve())}>
          Aceptar
        </Button>
      </div>
    </Dialog>
  );
}
