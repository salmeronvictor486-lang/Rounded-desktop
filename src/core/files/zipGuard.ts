import { getLimits, type ImportLimits } from '@/config/limits';
import { SecurityError, FileFormatError } from './errors';

export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * Lee el directorio central de un ZIP sin descomprimir nada y valida:
 * número de entradas, tamaño total descomprimido, relación de compresión y
 * rutas peligrosas. Se ejecuta ANTES de entregar el archivo a JSZip/ExcelJS.
 */
export function inspectZip(data: Uint8Array, limits: ImportLimits = getLimits()): ZipEntryInfo[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 22 || view.getUint32(0, true) !== 0x04034b50) {
    throw new FileFormatError('El archivo no es un contenedor ZIP válido.');
  }
  // Buscar el registro "End of central directory" (máx. 64 KiB de comentario).
  let eocd = -1;
  const minPos = Math.max(0, data.length - 22 - 0xffff);
  for (let i = data.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FileFormatError('El ZIP está dañado (no se encontró el directorio central).');
  let entryCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  // ZIP64
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator >= 0 && view.getUint32(locator, true) === 0x07064b50) {
      const z64 = Number(view.getBigUint64(locator + 8, true));
      if (z64 + 56 <= data.length && view.getUint32(z64, true) === 0x06064b50) {
        entryCount = Number(view.getBigUint64(z64 + 32, true));
        cdOffset = Number(view.getBigUint64(z64 + 48, true));
      }
    }
  }
  if (entryCount > limits.maxZipEntries) {
    throw new SecurityError(`El archivo contiene demasiadas entradas (${entryCount}).`);
  }
  const entries: ZipEntryInfo[] = [];
  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > data.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new FileFormatError('El ZIP está dañado (entrada del directorio central no válida).');
    }
    let compressedSize = view.getUint32(p + 20, true);
    let uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const nameBytes = data.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    // Campo extra ZIP64 con tamaños reales
    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = view.getUint16(e, true);
        const size = view.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(view.getBigUint64(q, true));
            q += 8;
          }
          if (compressedSize === 0xffffffff) compressedSize = Number(view.getBigUint64(q, true));
        }
        e += 4 + size;
      }
    }
    if (name.includes('\\') || name.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(name) || /^[a-z]:/i.test(name)) {
      throw new SecurityError(`El archivo contiene una ruta no permitida: ${name}`);
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio && uncompressedSize > 1024 * 1024) {
      throw new SecurityError('El archivo tiene una relación de compresión sospechosa (posible "zip bomb").');
    }
    total += uncompressedSize;
    if (total > limits.maxZipUncompressedBytes) {
      throw new SecurityError('El contenido descomprimido supera el límite permitido.');
    }
    entries.push({ name, compressedSize, uncompressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
