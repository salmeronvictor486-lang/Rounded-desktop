import type { ShapeKind } from './model';

export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rectángulo' },
  { id: 'roundRect', label: 'Rectángulo redondeado' },
  { id: 'ellipse', label: 'Elipse' },
  { id: 'triangle', label: 'Triángulo' },
  { id: 'diamond', label: 'Rombo' },
  { id: 'pentagon', label: 'Pentágono' },
  { id: 'hexagon', label: 'Hexágono' },
  { id: 'star', label: 'Estrella' },
  { id: 'arrowRight', label: 'Flecha derecha' },
  { id: 'arrowLeft', label: 'Flecha izquierda' },
  { id: 'chevron', label: 'Cheurón' },
  { id: 'callout', label: 'Bocadillo' },
  { id: 'heart', label: 'Corazón' },
  { id: 'cloud', label: 'Nube' },
];

function poly(points: [number, number][]): string {
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

/** Trazado SVG de una forma dentro de una caja w×h. */
export function shapePath(kind: ShapeKind, w: number, h: number): string {
  switch (kind) {
    case 'rect':
      return `M 0 0 H ${w} V ${h} H 0 Z`;
    case 'roundRect': {
      const r = Math.min(w, h) * 0.16;
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    }
    case 'ellipse':
      return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A ${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
    case 'triangle':
      return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'diamond':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'pentagon':
      return poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
    case 'hexagon':
      return poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]);
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 0.5 : 0.2;
        pts.push([w / 2 + Math.cos(a) * w * r, h / 2 + Math.sin(a) * h * r * 1.05 + h * 0.03]);
      }
      return poly(pts);
    }
    case 'arrowRight':
      return poly([[0, h * 0.28], [w * 0.62, h * 0.28], [w * 0.62, 0], [w, h / 2], [w * 0.62, h], [w * 0.62, h * 0.72], [0, h * 0.72]]);
    case 'arrowLeft':
      return poly([[w, h * 0.28], [w * 0.38, h * 0.28], [w * 0.38, 0], [0, h / 2], [w * 0.38, h], [w * 0.38, h * 0.72], [w, h * 0.72]]);
    case 'chevron':
      return poly([[0, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [0, h], [w * 0.25, h / 2]]);
    case 'callout': {
      const r = Math.min(w, h) * 0.1;
      const bh = h * 0.78;
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${bh - r} Q ${w} ${bh} ${w - r} ${bh} H ${w * 0.42} L ${w * 0.22} ${h} L ${w * 0.26} ${bh} H ${r} Q 0 ${bh} 0 ${bh - r} V ${r} Q 0 0 ${r} 0 Z`;
    }
    case 'heart':
      return `M ${w / 2} ${h * 0.95} C ${w * -0.1} ${h * 0.55} ${w * 0.05} ${h * -0.05} ${w / 2} ${h * 0.25} C ${w * 0.95} ${h * -0.05} ${w * 1.1} ${h * 0.55} ${w / 2} ${h * 0.95} Z`;
    case 'cloud':
      return `M ${w * 0.25} ${h * 0.85} C ${w * 0.02} ${h * 0.85} ${w * 0.02} ${h * 0.5} ${w * 0.22} ${h * 0.48} C ${w * 0.2} ${h * 0.2} ${w * 0.5} ${h * 0.1} ${w * 0.58} ${h * 0.3} C ${w * 0.7} ${h * 0.12} ${w * 0.95} ${h * 0.25} ${w * 0.85} ${h * 0.5} C ${w} ${h * 0.55} ${w} ${h * 0.85} ${w * 0.78} ${h * 0.85} Z`;
  }
}
