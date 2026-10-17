import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { SlideView } from '../SlideView';
import type { SlidesStore } from '../store';

export function Thumbnails({ store, onContextMenu }: { store: SlidesStore; version: number; onContextMenu: (i: number, x: number, y: number) => void }) {
  const pres = store.pres;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const scale = 176 / pres.size.width;
  return (
    <nav className="thumbs" aria-label="Diapositivas">
      <ol>
        {pres.slides.map((s, i) => (
          <li
            key={s.id}
            className={`thumb ${i === store.current ? 'is-current' : ''} ${dropAt === i ? 'drop-before' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/x-slide', String(i));
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDropAt(i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) store.moveSlide(dragFrom, i);
              setDragFrom(null);
              setDropAt(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              store.goTo(i);
              onContextMenu(i, e.clientX, e.clientY);
            }}
          >
            <span className="thumb-num">{i + 1}</span>
            <button
              type="button"
              className="thumb-btn"
              aria-label={`Diapositiva ${i + 1}${s.hidden ? ' (oculta)' : ''}`}
              aria-current={i === store.current ? 'true' : undefined}
              onClick={() => store.goTo(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  store.goTo(i + 1);
                  (e.currentTarget.closest('ol')?.children[i + 1]?.querySelector('button') as HTMLElement | null)?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  store.goTo(i - 1);
                  (e.currentTarget.closest('ol')?.children[i - 1]?.querySelector('button') as HTMLElement | null)?.focus();
                } else if (e.key === 'Delete') {
                  store.deleteSlide(i);
                }
              }}
            >
              <SlideView slide={s} pres={pres} scale={scale} className={s.hidden ? 'is-hidden' : ''} />
              {s.hidden && <EyeOff size={14} className="thumb-hidden" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
