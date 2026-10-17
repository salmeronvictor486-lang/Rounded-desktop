/** Notificaciones entre pestañas (BroadcastChannel) y dentro de la misma pestaña. */
export type StorageEvent =
  | { type: 'saved'; id: string; revision: number; origin: string }
  | { type: 'changed'; id?: string; origin: string };

export const TAB_ID = Math.random().toString(36).slice(2);

type Listener = (e: StorageEvent) => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel('rounded-desktop-storage');
  channel.onmessage = (ev) => listeners.forEach((l) => l(ev.data as StorageEvent));
  return channel;
}

type WithoutOrigin<T> = T extends unknown ? Omit<T, 'origin'> : never;

export function emitStorageEvent(e: WithoutOrigin<StorageEvent>): void {
  const full = { ...e, origin: TAB_ID } as StorageEvent;
  listeners.forEach((l) => l(full));
  try {
    getChannel()?.postMessage(full);
  } catch {
    /* canal cerrado */
  }
}

export function onStorageEvent(listener: Listener): () => void {
  getChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
