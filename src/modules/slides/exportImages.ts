import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import { dataUrlToBytes } from '@/core/files/download';
import type { Presentation, Slide } from './model';
import { SlideView } from './SlideView';
import './slides.css';

/** Renderiza una diapositiva fuera de pantalla y la convierte en PNG. */
export async function slideToPng(pres: Presentation, slide: Slide, pixelRatio = 2): Promise<Uint8Array> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(SlideView, { slide, pres, scale: 1 })));
    const node = host.querySelector('.slide-frame') as HTMLElement;
    await Promise.all(Array.from(node.querySelectorAll('img')).map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
    const dataUrl = await toPng(node, { pixelRatio, width: pres.size.width, height: pres.size.height, cacheBust: false });
    return dataUrlToBytes(dataUrl).bytes;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function exportAllPng(pres: Presentation): Promise<Blob> {
  const zip = new JSZip();
  for (let i = 0; i < pres.slides.length; i++) {
    zip.file(`diapositiva-${String(i + 1).padStart(2, '0')}.png`, await slideToPng(pres, pres.slides[i]));
  }
  return zip.generateAsync({ type: 'blob' });
}
