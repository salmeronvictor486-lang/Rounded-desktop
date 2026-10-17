/** Separadores numéricos de la interfaz (según el idioma del navegador). Los códigos de formato siempre usan "." y ",". */
export interface NumberLocale {
  decimal: string;
  group: string;
  /** Orden de fecha al escribir 01/02/2025: día-mes (dmy) o mes-día (mdy). */
  dateOrder: 'dmy' | 'mdy';
  months: string[];
  monthsShort: string[];
  days: string[];
  daysShort: string[];
}

const ES: NumberLocale = {
  decimal: ',',
  group: '.',
  dateOrder: 'dmy',
  months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  daysShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
};

const EN: NumberLocale = {
  decimal: '.',
  group: ',',
  dateOrder: 'mdy',
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function detect(): NumberLocale {
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'es';
  if (lang.startsWith('en-US') || lang === 'en') return EN;
  if (lang.startsWith('en')) return { ...EN, dateOrder: 'dmy' };
  if (/^(de|fr|it|pt|nl|ca|gl|eu|es)/.test(lang)) return { ...ES };
  return ES;
}

let current: NumberLocale = detect();

export function getLocale(): NumberLocale {
  return current;
}

/** Solo para pruebas y ajustes. */
export function setLocale(kind: 'es' | 'en'): void {
  current = kind === 'es' ? ES : EN;
}
