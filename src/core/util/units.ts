// Conversión de unidades usadas por los formatos ofimáticos.
export const PX_PER_INCH = 96;
export const EMU_PER_INCH = 914400;
export const EMU_PER_PX = EMU_PER_INCH / PX_PER_INCH; // 9525
export const TWIP_PER_INCH = 1440;
export const TWIP_PER_PX = TWIP_PER_INCH / PX_PER_INCH; // 15
export const PT_PER_INCH = 72;

export const mmToPx = (mm: number) => (mm / 25.4) * PX_PER_INCH;
export const pxToMm = (px: number) => (px / PX_PER_INCH) * 25.4;
export const twipToPx = (tw: number) => tw / TWIP_PER_PX;
export const pxToTwip = (px: number) => Math.round(px * TWIP_PER_PX);
export const emuToPx = (emu: number) => emu / EMU_PER_PX;
export const pxToEmu = (px: number) => Math.round(px * EMU_PER_PX);
export const ptToPx = (pt: number) => (pt * PX_PER_INCH) / PT_PER_INCH;
export const pxToPt = (px: number) => (px * PT_PER_INCH) / PX_PER_INCH;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
