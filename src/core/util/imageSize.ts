/** Dimensiones de una imagen leyendo su cabecera (PNG, JPEG, GIF, BMP, WebP, SVG). */
export function imageSize(bytes: Uint8Array): { width: number; height: number; type: 'png' | 'jpg' | 'gif' | 'bmp' | 'webp' | 'svg' } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && v.getUint32(0) === 0x89504e47) {
    return { width: v.getUint32(16), height: v.getUint32(20), type: 'png' };
  }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: v.getUint16(6, true), height: v.getUint16(8, true), type: 'gif' };
  }
  if (bytes.length > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)), type: 'bmp' };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2;
    while (p + 9 < bytes.length) {
      if (bytes[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = bytes[p + 1];
      const len = v.getUint16(p + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: v.getUint16(p + 5), width: v.getUint16(p + 7), type: 'jpg' };
      }
      p += 2 + len;
    }
    return null;
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)), type: 'webp' };
    if (chunk === 'VP8 ') return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff, type: 'webp' };
    if (chunk === 'VP8L') {
      const b = v.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, type: 'webp' };
    }
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 2048));
  if (/<svg[\s>]/i.test(head)) {
    const w = /\swidth="([\d.]+)(px)?"/i.exec(head);
    const h = /\sheight="([\d.]+)(px)?"/i.exec(head);
    const vb = /viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/i.exec(head);
    const width = w ? parseFloat(w[1]) : vb ? parseFloat(vb[1]) : 300;
    const height = h ? parseFloat(h[1]) : vb ? parseFloat(vb[2]) : 150;
    return { width, height, type: 'svg' };
  }
  return null;
}

/** Convierte cualquier imagen del navegador a PNG mediante canvas (para formatos que no admite el destino). */
export async function rasterizeToPng(dataUrl: string, width: number, height: number): Promise<Uint8Array> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo convertir la imagen'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
