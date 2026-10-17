/** Fechas como números de serie (sistema 1900 de Excel, con su error histórico del 29/02/1900). */
const MS_PER_DAY = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

export function dateToSerial(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number {
  const ms = Date.UTC(y, m - 1, d, h, mi, s) - EPOCH;
  let serial = ms / MS_PER_DAY;
  if (serial < 61) serial -= 1; // antes del 1/3/1900 Excel cuenta el 29/2/1900 inexistente
  return serial;
}

export function jsDateToSerial(date: Date): number {
  return dateToSerial(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
}

export interface DateParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
  dow: number; // 0 = domingo
}

export function serialToParts(serial: number): DateParts {
  let s = serial;
  if (s < 61) s += 1;
  // Redondeo a milisegundos para evitar 23:59:59.999
  const ms = Math.round(s * MS_PER_DAY) + EPOCH;
  const d = new Date(ms);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
    dow: d.getUTCDay(),
  };
}

export function serialToUTCDate(serial: number): Date {
  let s = serial;
  if (s < 61) s += 1;
  return new Date(Math.round(s * MS_PER_DAY) + EPOCH);
}
