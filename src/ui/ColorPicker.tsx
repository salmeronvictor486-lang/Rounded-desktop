import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef } from 'react';

export const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#ffffff',
  '#b91c1c', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777',
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8',
  '#7f1d1d', '#7c2d12', '#713f12', '#14532d', '#164e63', '#1e3a8a', '#4c1d95', '#831843',
];

interface Props {
  label: string;
  value?: string | null;
  onChange: (color: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  children: React.ReactNode;
  className?: string;
}

/** Botón con paleta de colores desplegable y selector personalizado. */
export function ColorPickerButton({ label, value, onChange, allowNone, noneLabel = 'Sin color', children, className = 'icon-btn' }: Props) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const r = btn.current.getBoundingClientRect();
    const pr = pop.current.getBoundingClientRect();
    let left = r.left;
    if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
    let top = r.bottom + 4;
    if (top + pr.height > window.innerHeight - 8) top = r.top - pr.height - 4;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  const pick = (c: string | null) => {
    onChange(c);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="color-popover"
            style={{ left: pos.left, top: pos.top }}
            role="dialog"
            aria-label={label}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
            }}
          >
            {allowNone && (
              <button type="button" className="color-none" onClick={() => pick(null)}>
                {noneLabel}
              </button>
            )}
            <div className="color-grid">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${value?.toLowerCase() === c ? 'is-selected' : ''}`}
                  style={{ background: c }}
                  aria-label={c}
                  title={c}
                  onClick={() => pick(c)}
                />
              ))}
            </div>
            <label className="color-custom">
              Personalizado
              <input type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
            </label>
          </div>,
          document.body,
        )}
    </>
  );
}
