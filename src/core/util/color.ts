/** Normaliza un color CSS sencillo a "RRGGBB" en mayúsculas (sin #). Devuelve null si no se reconoce. */
export function toHex6(color: string | null | undefined): string | null {
  if (!color) return null;
  const c = color.trim();
  let m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^#?([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split('').map((ch) => ch + ch).join('').toUpperCase();
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return [m[1], m[2], m[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('').toUpperCase();
  const named: Record<string, string> = {
    black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
    cyan: '00FFFF', magenta: 'FF00FF', gray: '808080', grey: '808080', darkblue: '00008B', darkred: '8B0000',
    darkgreen: '006400', lightgray: 'D3D3D3', orange: 'FFA500', purple: '800080',
  };
  return named[c.toLowerCase()] ?? null;
}

/** Colores de resaltado de Word (w:highlight) ↔ hex. */
export const WORD_HIGHLIGHTS: Record<string, string> = {
  yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000',
  darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000',
  darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0', black: '000000', white: 'FFFFFF',
};

export function nearestWordHighlight(hex: string): string {
  const target = parseInt(hex, 16);
  const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
  let best = 'yellow';
  let bestDist = Infinity;
  for (const [name, h] of Object.entries(WORD_HIGHLIGHTS)) {
    const v = parseInt(h, 16);
    const d = (((v >> 16) & 255) - tr) ** 2 + (((v >> 8) & 255) - tg) ** 2 + ((v & 255) - tb) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

/** Luminancia relativa para decidir texto claro/oscuro sobre un fondo. */
export function isDark(hex: string): boolean {
  const v = parseInt(hex.replace('#', ''), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}
