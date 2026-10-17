import Image from '@tiptap/extension-image';
import { isSafeImageSrc } from '@/core/files/validate';

/**
 * Imagen con ancho y alineación. Solo se aceptan imágenes incrustadas
 * (data:/blob:) para no cargar recursos remotos sin permiso.
 */
export const DocImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => (isSafeImageSrc((el as HTMLElement).getAttribute('src') ?? '') ? {} : false) }];
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => {
          const src = el.getAttribute('src') ?? '';
          return isSafeImageSrc(src) ? src : null;
        },
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || (el as HTMLElement).style.width;
          const n = parseFloat(w || '');
          return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align }),
      },
    };
  },
}).configure({ inline: false, allowBase64: true });
