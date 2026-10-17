import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  /** Descripción accesible adicional. */
  description?: string;
}

/**
 * Diálogo modal basado en <dialog> nativo: atrapa el foco, se cierra con
 * Escape y es anunciado por los lectores de pantalla.
 */
export function Dialog({ open, title, onClose, children, footer, width = 480, className = '', description }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      style={{ width }}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {description && (
          <p id={descId} className="dialog-description">
            {description}
          </p>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
