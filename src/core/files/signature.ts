export type DetectedContainer = 'zip' | 'pdf' | 'ole' | 'rtf' | 'text' | 'unknown';

/** Detecta el tipo real del archivo por sus primeros bytes (no por la extensión). */
export function detectContainer(bytes: Uint8Array): DetectedContainer {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'zip';
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-') return 'pdf';
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'ole';
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 6)));
  if (head.startsWith('{\\rtf')) return 'rtf';
  // Heurística de texto: sin bytes nulos en los primeros 4 KiB
  const sample = bytes.subarray(0, 4096);
  if (!sample.includes(0)) return 'text';
  return 'unknown';
}

/** Decodifica texto detectando BOM; intenta UTF-8 estricto y recurre a Windows-1252. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}
