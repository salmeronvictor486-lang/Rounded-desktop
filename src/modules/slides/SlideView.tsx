import type { CSSProperties } from 'react';
import { escapeHtml } from '@/core/util/escape';
import type { Background, Presentation, Slide, SlideElement, TextFontDefaults } from './model';
import { shapePath } from './shapes';
import { slideTextHtml } from './textSchema';

export function backgroundCss(bg: Background | null | undefined, fallback: Background): CSSProperties {
  const b = bg ?? fallback;
  if (b.type === 'solid') return { background: b.color };
  if (b.type === 'gradient') return { background: `linear-gradient(${b.angle}deg, ${b.from}, ${b.to})` };
  return { backgroundImage: `url("${b.src}")`, backgroundSize: b.fit, backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#000' };
}

/** Estilo CSS del formato por defecto de un cuadro de texto. */
export function fontDefaultsCss(f: TextFontDefaults | undefined): CSSProperties {
  if (!f) return {};
  return {
    fontSize: f.size ? `${f.size}px` : undefined,
    color: f.color,
    fontFamily: f.family,
    fontWeight: f.bold ? 700 : undefined,
    fontStyle: f.italic ? 'italic' : undefined,
    textAlign: f.align,
  };
}

export function elementBoxStyle(el: SlideElement): CSSProperties {
  return {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity ?? undefined,
  };
}

/** Contenido visual de un elemento (sin interacción). */
export function ElementContent({ el, pres, hideText }: { el: SlideElement; pres: Presentation; hideText?: boolean }) {
  const theme = pres.theme;
  switch (el.type) {
    case 'text': {
      const s = el.style;
      return (
        <div
          className={`sl-text valign-${s.vAlign ?? 'top'}`}
          style={{
            background: s.fill ?? undefined,
            border: s.stroke ? `${s.strokeWidth ?? 1}px solid ${s.stroke}` : undefined,
            borderRadius: s.radius,
            padding: s.padding ?? 8,
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
          }}
        >
          {!hideText && <div className="sl-rich" style={fontDefaultsCss(s.font)} dangerouslySetInnerHTML={{ __html: slideTextHtml(el.content) }} />}
        </div>
      );
    }
    case 'shape':
      return (
        <>
          <svg width={el.w} height={el.h} viewBox={`${-el.strokeWidth / 2} ${-el.strokeWidth / 2} ${el.w + el.strokeWidth} ${el.h + el.strokeWidth}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
            <path d={shapePath(el.shape, el.w, el.h)} fill={el.fill ?? 'none'} stroke={el.stroke ?? 'none'} strokeWidth={el.strokeWidth} strokeLinejoin="round" />
          </svg>
          {el.content && !hideText && (
            <div className={`sl-text valign-${el.vAlign ?? 'middle'}`} style={{ position: 'absolute', inset: 0, padding: 10, color: theme.colors.text, fontFamily: theme.fonts.body }}>
              <div className="sl-rich" dangerouslySetInnerHTML={{ __html: slideTextHtml(el.content) }} />
            </div>
          )}
        </>
      );
    case 'line': {
      const x1 = el.flipH ? el.w : 0;
      const x2 = el.flipH ? 0 : el.w;
      const y1 = el.flipV ? el.h : 0;
      const y2 = el.flipV ? 0 : el.h;
      const id = `ah-${el.id}`;
      return (
        <svg width={Math.max(1, el.w)} height={Math.max(1, el.h)} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
          <defs>
            <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={el.stroke} />
            </marker>
          </defs>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={el.stroke}
            strokeWidth={el.strokeWidth}
            strokeDasharray={el.dash === 'dash' ? `${el.strokeWidth * 4} ${el.strokeWidth * 3}` : el.dash === 'dot' ? `${el.strokeWidth} ${el.strokeWidth * 2}` : undefined}
            strokeLinecap="round"
            markerEnd={el.arrowEnd ? `url(#${id})` : undefined}
            markerStart={el.arrowStart ? `url(#${id})` : undefined}
          />
        </svg>
      );
    }
    case 'image':
      return <img src={el.src} alt={el.alt} draggable={false} style={{ width: '100%', height: '100%', objectFit: el.fit, borderRadius: el.radius, display: 'block', userSelect: 'none' }} />;
    case 'table': {
      const totalCols = el.colWidths.length || el.rows[0]?.length || 1;
      return (
        <table className="sl-table" style={{ fontSize: el.fontSize, color: theme.colors.text, fontFamily: theme.fonts.body, borderColor: el.borderColor }}>
          <colgroup>
            {Array.from({ length: totalCols }, (_, i) => (
              <col key={i} style={{ width: `${(el.colWidths[i] ?? 1 / totalCols) * 100}%` }} />
            ))}
          </colgroup>
          <tbody>
            {el.rows.map((row, r) => (
              <tr key={r} style={{ height: `${100 / el.rows.length}%` }}>
                {row.map((cell, c) => {
                  const header = el.headerRow && r === 0;
                  return (
                    <td
                      key={c}
                      style={{
                        background: cell.fill ?? (header ? el.headerFill : undefined),
                        color: cell.color ?? (header ? '#ffffff' : undefined),
                        fontWeight: cell.bold || header ? 700 : undefined,
                        textAlign: cell.align,
                        borderColor: el.borderColor,
                      }}
                      dangerouslySetInnerHTML={{ __html: escapeHtml(cell.text).replace(/\n/g, '<br>') }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }
}

/** Diapositiva completa a tamaño nativo; se escala con `scale`. */
export function SlideView({ slide, pres, scale = 1, className = '', visibleSteps, hiddenElementId }: { slide: Slide; pres: Presentation; scale?: number; className?: string; visibleSteps?: number; hiddenElementId?: string | null }) {
  const { width, height } = pres.size;
  let step = 0;
  return (
    <div className={`slide-frame ${className}`} style={{ width: width * scale, height: height * scale }}>
      <div className="slide-surface" style={{ width, height, transform: `scale(${scale})`, ...backgroundCss(slide.background, pres.theme.background) }}>
        {slide.elements.map((el) => {
          let animClass = '';
          if (visibleSteps !== undefined && el.animation) {
            step++;
            if (step > visibleSteps) return null;
            if (step === visibleSteps) animClass = `anim-${el.animation.type}`;
          }
          return (
            <div key={el.id} className={`sl-el sl-${el.type} ${animClass}`} style={elementBoxStyle(el)}>
              <ElementContent el={el} pres={pres} hideText={hiddenElementId === el.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function animationSteps(slide: Slide): number {
  return slide.elements.filter((e) => e.animation).length;
}
