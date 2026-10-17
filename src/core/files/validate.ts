import { getLimits } from '@/config/limits';
import { formatBytes } from '@/core/util/format';
import { SecurityError } from './errors';

/** Lee un File comprobando primero el límite de tamaño configurado. */
export async function readFileBytes(file: Blob & { name?: string }): Promise<Uint8Array> {
  const { maxFileBytes } = getLimits();
  if (file.size > maxFileBytes) {
    throw new SecurityError(
      `El archivo ocupa ${formatBytes(file.size)} y supera el límite de importación (${formatBytes(maxFileBytes)}). Puedes cambiarlo en Ajustes.`,
    );
  }
  return new Uint8Array(await file.arrayBuffer());
}

/** Rechaza URLs con protocolos potencialmente peligrosos (javascript:, data:text/html, vbscript:...). */
export function isSafeLinkHref(href: string): boolean {
  const h = href.trim();
  if (h.startsWith('#')) return true;
  try {
    const u = new URL(h, 'https://local.invalid/');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/** Solo se aceptan imágenes incrustadas (data:image/... o blob:). Las remotas no se cargan por privacidad. */
export function isSafeImageSrc(src: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);/i.test(src) || src.startsWith('blob:');
}
