/** Eje de la cuadrícula con tamaños variables y elementos ocultos. Búsqueda binaria de posición → índice. */
export class Axis {
  readonly offsets: Float64Array;

  constructor(
    readonly count: number,
    readonly defaultSize: number,
    sizes: Record<number, number>,
    hidden?: Set<number>,
  ) {
    this.offsets = new Float64Array(count + 1);
    let acc = 0;
    for (let i = 0; i < count; i++) {
      this.offsets[i] = acc;
      acc += hidden?.has(i) ? 0 : sizes[i] ?? defaultSize;
    }
    this.offsets[count] = acc;
  }

  get total(): number {
    return this.offsets[this.count];
  }

  offset(i: number): number {
    if (i <= 0) return 0;
    if (i >= this.count) return this.total + (i - this.count) * this.defaultSize;
    return this.offsets[i];
  }

  size(i: number): number {
    if (i >= this.count) return this.defaultSize;
    return this.offsets[i + 1] - this.offsets[i];
  }

  /** Índice del elemento que contiene la posición `px`. */
  indexAt(px: number): number {
    if (px <= 0) return 0;
    if (px >= this.total) return Math.max(0, this.count - 1);
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= px) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

export const HEADER_W = 48;
export const HEADER_H = 24;
