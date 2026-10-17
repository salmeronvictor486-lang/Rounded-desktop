import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
  add: (t: Omit<Toast, 'id'>, ttl?: number) => void;
  remove: (id: number) => void;
}

let seq = 1;
const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  add: (t, ttl = 5000) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    if (ttl > 0) setTimeout(() => get().remove(id), ttl);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (message: string, detail?: string) => useToastStore.getState().add({ kind: 'info', message, detail }),
  success: (message: string, detail?: string) => useToastStore.getState().add({ kind: 'success', message, detail }),
  warning: (message: string, detail?: string) => useToastStore.getState().add({ kind: 'warning', message, detail }, 9000),
  error: (message: string, detail?: string) => useToastStore.getState().add({ kind: 'error', message, detail }, 10000),
};

/** Muestra un error de forma comprensible. */
export function reportError(err: unknown, context?: string): void {
  console.error(context ?? 'Error', err);
  const msg = err instanceof Error ? err.message : String(err);
  toast.error(context ? `${context}: ${msg}` : msg);
}

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  return (
    <div className="toast-host" role="region" aria-label="Notificaciones">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden="true" />
            <div className="toast-text">
              <div>{t.message}</div>
              {t.detail && <div className="toast-detail">{t.detail}</div>}
            </div>
            <button type="button" className="icon-btn" aria-label="Cerrar notificación" onClick={() => remove(t.id)}>
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
