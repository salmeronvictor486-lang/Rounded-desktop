import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, StickyNote, X } from 'lucide-react';
import type { Presentation } from '../model';
import { SlideView, animationSteps } from '../SlideView';

/** Modo presentación a pantalla completa con transiciones, animaciones por pasos y notas. */
export function Presenter({ pres, start, onExit }: { pres: Presentation; start: number; onExit: (lastIndex: number) => void }) {
  const slides = pres.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden || x.i === start);
  const startPos = Math.max(0, slides.findIndex((x) => x.i === start));
  const [pos, setPos] = useState(startPos);
  const [step, setStep] = useState(0);
  const [black, setBlack] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [transitionKey, setTransitionKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [cursorIdle, setCursorIdle] = useState(false);

  const current = slides[pos]?.s;
  const steps = current ? animationSteps(current) : 0;

  const next = useCallback(() => {
    if (step < steps) setStep((s) => s + 1);
    else if (pos < slides.length - 1) {
      setPos((p) => p + 1);
      setStep(0);
      setTransitionKey((k) => k + 1);
    } else onExit(slides[pos].i);
  }, [step, steps, pos, slides, onExit]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
    else if (pos > 0) {
      const p = pos - 1;
      setPos(p);
      setStep(animationSteps(slides[p].s));
      setTransitionKey((k) => k + 1);
    }
  }, [step, pos, slides]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    el?.requestFullscreen?.().catch(() => undefined);
    el?.focus();
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => {
      if (!document.fullscreenElement) onExit(slides[posRef.current]?.i ?? start);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const move = () => {
      setCursorIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setCursorIdle(true), 2500);
    };
    window.addEventListener('mousemove', move);
    move();
    return () => {
      window.removeEventListener('mousemove', move);
      clearTimeout(t);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k)) {
      e.preventDefault();
      if (black) setBlack(false);
      else next();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) {
      e.preventDefault();
      prev();
    } else if (k === 'Home') {
      setPos(0);
      setStep(0);
    } else if (k === 'End') {
      setPos(slides.length - 1);
      setStep(0);
    } else if (k === 'Escape') {
      onExit(slides[pos].i);
    } else if (k === 'b' || k === 'B' || k === '.') {
      setBlack((b) => !b);
    } else if (k === 's' || k === 'S') {
      setShowNotes((v) => !v);
    }
  };

  if (!current) return null;
  const scale = Math.min(size.w / pres.size.width, (size.h - (showNotes ? 140 : 0)) / pres.size.height);
  const tr = current.transition ?? { type: 'none', duration: 0 };

  return createPortal(
    <div
      ref={rootRef}
      className={`presenter ${cursorIdle ? 'cursor-idle' : ''}`}
      tabIndex={-1}
      role="dialog"
      aria-label="Modo presentación"
      onKeyDown={onKey}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.presenter-bar')) return;
        if (black) setBlack(false);
        else next();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        prev();
      }}
    >
      <div key={transitionKey} className={`presenter-slide tr-${tr.type}`} style={{ animationDuration: `${tr.duration}s` }}>
        <SlideView slide={current} pres={pres} scale={scale} visibleSteps={step} />
      </div>
      {showNotes && <div className="presenter-notes">{current.notes || <em>Sin notas para esta diapositiva.</em>}</div>}
      {black && <div className="presenter-black" />}
      <div className="presenter-bar" role="toolbar" aria-label="Controles de la presentación">
        <button type="button" aria-label="Anterior" onClick={prev}><ChevronLeft size={18} /></button>
        <span aria-live="polite">{pos + 1} / {slides.length}</span>
        <button type="button" aria-label="Siguiente" onClick={next}><ChevronRight size={18} /></button>
        <button type="button" aria-label="Mostrar notas (S)" aria-pressed={showNotes} onClick={() => setShowNotes((v) => !v)}><StickyNote size={16} /></button>
        <button type="button" aria-label="Salir (Esc)" onClick={() => onExit(slides[pos].i)}><X size={18} /></button>
      </div>
    </div>,
    document.body,
  );
}
