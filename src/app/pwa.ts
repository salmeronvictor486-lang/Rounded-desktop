import { toast } from '@/ui/toast';
import { confirmDialog } from '@/ui/dialogs';

/** Registra el service worker (solo en producción) para uso sin conexión e instalación como PWA. */
export function initPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh: async () => {
        const ok = await confirmDialog({
          title: 'Actualización disponible',
          message: 'Hay una nueva versión de la aplicación. Tus documentos están guardados. ¿Recargar ahora?',
          confirmLabel: 'Actualizar',
        });
        if (ok) void update(true);
      },
      onOfflineReady: () => toast.success('La aplicación ya funciona sin conexión.'),
    });
  });
}
