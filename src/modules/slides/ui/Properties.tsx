import { Plus, Trash2 } from 'lucide-react';
import { blobToDataUrl, pickFiles } from '@/core/files/download';
import { Button, IconButton } from '@/ui/Button';
import { ColorPickerButton } from '@/ui/ColorPicker';
import { toast } from '@/ui/toast';
import type { AnimationType, Background, SlideElement, TableElement, TransitionType } from '../model';
import { SHAPES } from '../shapes';
import type { SlidesStore } from '../store';

const ANIMS: { id: AnimationType | ''; label: string }[] = [
  { id: '', label: 'Ninguna' },
  { id: 'appear', label: 'Aparecer' },
  { id: 'fade', label: 'Desvanecer' },
  { id: 'fly-up', label: 'Entrar desde abajo' },
  { id: 'fly-left', label: 'Entrar desde la derecha' },
  { id: 'zoom', label: 'Zoom' },
];

const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'none', label: 'Ninguna' },
  { id: 'fade', label: 'Desvanecer' },
  { id: 'slide', label: 'Desplazar' },
  { id: 'zoom', label: 'Zoom' },
];

function Num({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const id = `p-${label.replace(/\W/g, '')}`;
  return (
    <label className="prop-num" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        className="input input-sm"
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <span className="faint">{suffix}</span>}
    </label>
  );
}

function ColorRow({ label, value, onChange, allowNone = true }: { label: string; value: string | null | undefined; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="prop-row">
      <span>{label}</span>
      <ColorPickerButton label={label} value={value ?? null} allowNone={allowNone} onChange={onChange} className="btn btn-sm">
        <span className="swatch" style={{ background: value ?? 'transparent' }} />
        <span>{value ?? 'Ninguno'}</span>
      </ColorPickerButton>
    </div>
  );
}

function BackgroundEditor({ store }: { store: SlidesStore }) {
  const slide = store.slide;
  const bg: Background = slide.background ?? store.pres.theme.background;
  const set = (b: Background | null, all = false) =>
    store.mutate((p) => {
      if (all) p.slides.forEach((s) => (s.background = b ? structuredClone(b) : null));
      else p.slides[store.current].background = b;
    });
  return (
    <div className="prop-section">
      <h4>Fondo</h4>
      <select
        className="select select-sm"
        aria-label="Tipo de fondo"
        value={slide.background ? bg.type : 'theme'}
        onChange={async (e) => {
          const v = e.target.value;
          if (v === 'theme') set(null);
          else if (v === 'solid') set({ type: 'solid', color: bg.type === 'solid' ? bg.color : '#ffffff' });
          else if (v === 'gradient') set({ type: 'gradient', from: store.pres.theme.colors.accent[0], to: store.pres.theme.colors.accent[1], angle: 135 });
          else {
            const [f] = await pickFiles('image/*');
            if (f) set({ type: 'image', src: await blobToDataUrl(f), fit: 'cover' });
          }
        }}
      >
        <option value="theme">Del tema</option>
        <option value="solid">Color sólido</option>
        <option value="gradient">Degradado</option>
        <option value="image">Imagen…</option>
      </select>
      {slide.background?.type === 'solid' && <ColorRow label="Color" value={slide.background.color} allowNone={false} onChange={(c) => c && set({ type: 'solid', color: c })} />}
      {slide.background?.type === 'gradient' && (
        <>
          <ColorRow label="Desde" value={slide.background.from} allowNone={false} onChange={(c) => c && slide.background?.type === 'gradient' && set({ ...slide.background, from: c })} />
          <ColorRow label="Hasta" value={slide.background.to} allowNone={false} onChange={(c) => c && slide.background?.type === 'gradient' && set({ ...slide.background, to: c })} />
          <Num label="Ángulo" value={slide.background.angle} min={0} max={360} onChange={(n) => slide.background?.type === 'gradient' && set({ ...slide.background, angle: n })} suffix="°" />
        </>
      )}
      {slide.background && (
        <Button size="sm" onClick={() => set(slide.background ?? null, true)}>
          Aplicar a todas
        </Button>
      )}
    </div>
  );
}

function TableEditor({ store, el }: { store: SlidesStore; el: TableElement }) {
  const upd = (fn: (t: TableElement) => void) => store.updateElements([el.id], (e) => e.type === 'table' && fn(e));
  return (
    <div className="prop-section">
      <h4>Tabla</h4>
      <div className="table-edit" style={{ gridTemplateColumns: `repeat(${el.rows[0]?.length ?? 1}, minmax(50px, 1fr))` }}>
        {el.rows.map((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              className="input input-sm"
              aria-label={`Fila ${r + 1}, columna ${c + 1}`}
              value={cell.text}
              onChange={(e) => store.updateElements([el.id], (t) => { if (t.type === 'table') t.rows[r][c].text = e.target.value; }, { history: false })}
              onFocus={() => store.checkpoint()}
            />
          )),
        )}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        <Button size="sm" icon={Plus} onClick={() => upd((t) => t.rows.push(t.rows[0].map(() => ({ text: '' }))))}>Fila</Button>
        <Button size="sm" icon={Plus} onClick={() => upd((t) => { t.rows.forEach((r) => r.push({ text: '' })); const n = t.rows[0].length; t.colWidths = Array(n).fill(1 / n); })}>Columna</Button>
        <Button size="sm" icon={Trash2} disabled={el.rows.length <= 1} onClick={() => upd((t) => t.rows.pop())}>Fila</Button>
        <Button size="sm" icon={Trash2} disabled={(el.rows[0]?.length ?? 0) <= 1} onClick={() => upd((t) => { t.rows.forEach((r) => r.pop()); const n = t.rows[0].length; t.colWidths = Array(n).fill(1 / n); })}>Columna</Button>
      </div>
      <label className="checkbox"><input type="checkbox" checked={el.headerRow} onChange={(e) => upd((t) => (t.headerRow = e.target.checked))} /> Fila de encabezado</label>
      <ColorRow label="Encabezado" value={el.headerFill} allowNone={false} onChange={(c) => c && upd((t) => (t.headerFill = c))} />
      <ColorRow label="Bordes" value={el.borderColor} allowNone={false} onChange={(c) => c && upd((t) => (t.borderColor = c))} />
      <Num label="Tamaño de letra" value={el.fontSize} min={8} max={72} onChange={(n) => upd((t) => (t.fontSize = n))} suffix="px" />
    </div>
  );
}

export function PropertiesPanel({ store }: { store: SlidesStore; version: number }) {
  const sel = store.selection;
  const slide = store.slide;
  if (!sel.length) {
    return (
      <aside className="props" aria-label="Propiedades de la diapositiva">
        <h3>Diapositiva {store.current + 1}</h3>
        <BackgroundEditor store={store} />
        <div className="prop-section">
          <h4>Transición</h4>
          <select
            className="select select-sm"
            aria-label="Transición"
            value={slide.transition?.type ?? 'none'}
            onChange={(e) => store.mutate((p) => (p.slides[store.current].transition = { type: e.target.value as TransitionType, duration: slide.transition?.duration ?? 0.5 }))}
          >
            {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <Num label="Duración" value={slide.transition?.duration ?? 0.5} min={0.1} max={3} step={0.1} suffix="s" onChange={(n) => store.mutate((p) => (p.slides[store.current].transition = { type: slide.transition?.type ?? 'fade', duration: n }))} />
          <Button size="sm" onClick={() => store.mutate((p) => p.slides.forEach((s) => (s.transition = structuredClone(slide.transition ?? { type: 'fade', duration: 0.5 }))))}>Aplicar a todas</Button>
        </div>
        <label className="checkbox"><input type="checkbox" checked={!!slide.hidden} onChange={(e) => store.mutate((p) => (p.slides[store.current].hidden = e.target.checked))} /> Ocultar en la presentación</label>
      </aside>
    );
  }
  const el = sel[0];
  const ids = sel.map((s) => s.id);
  const upd = (patch: Partial<SlideElement> | ((e: SlideElement) => void)) => store.updateElements(ids, patch);
  return (
    <aside className="props" aria-label="Propiedades del elemento">
      <h3>{sel.length > 1 ? `${sel.length} elementos` : { text: 'Cuadro de texto', shape: 'Forma', line: 'Línea', image: 'Imagen', table: 'Tabla' }[el.type]}</h3>
      {sel.length === 1 && (
        <div className="prop-section prop-grid">
          <Num label="X" value={el.x} onChange={(n) => upd({ x: n })} />
          <Num label="Y" value={el.y} onChange={(n) => upd({ y: n })} />
          <Num label="Ancho" value={el.w} min={1} onChange={(n) => upd({ w: Math.max(1, n) })} />
          <Num label="Alto" value={el.h} min={1} onChange={(n) => upd({ h: Math.max(1, n) })} />
          <Num label="Giro" value={el.rotation} min={0} max={359} suffix="°" onChange={(n) => upd({ rotation: ((n % 360) + 360) % 360 })} />
          <Num label="Opacidad" value={Math.round((el.opacity ?? 1) * 100)} min={5} max={100} suffix="%" onChange={(n) => upd({ opacity: Math.max(0.05, Math.min(1, n / 100)) })} />
        </div>
      )}
      {el.type === 'text' && (
        <div className="prop-section">
          <h4>Cuadro</h4>
          <ColorRow label="Relleno" value={el.style.fill} onChange={(c) => upd((e) => e.type === 'text' && (e.style = { ...e.style, fill: c }))} />
          <ColorRow label="Borde" value={el.style.stroke} onChange={(c) => upd((e) => e.type === 'text' && (e.style = { ...e.style, stroke: c, strokeWidth: e.style.strokeWidth ?? 1 }))} />
          <div className="prop-row">
            <span>Alineación vertical</span>
            <select className="select select-sm" value={el.style.vAlign ?? 'top'} onChange={(e) => upd((x) => x.type === 'text' && (x.style = { ...x.style, vAlign: e.target.value as 'top' }))}>
              <option value="top">Arriba</option><option value="middle">Centro</option><option value="bottom">Abajo</option>
            </select>
          </div>
          <Num label="Esquinas" value={el.style.radius ?? 0} min={0} max={200} onChange={(n) => upd((x) => x.type === 'text' && (x.style = { ...x.style, radius: n }))} />
        </div>
      )}
      {el.type === 'shape' && (
        <div className="prop-section">
          <h4>Forma</h4>
          <select className="select select-sm" aria-label="Tipo de forma" value={el.shape} onChange={(e) => upd((x) => x.type === 'shape' && (x.shape = e.target.value as typeof x.shape))}>
            {SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <ColorRow label="Relleno" value={el.fill} onChange={(c) => upd((e) => e.type === 'shape' && (e.fill = c))} />
          <ColorRow label="Contorno" value={el.stroke} onChange={(c) => upd((e) => e.type === 'shape' && (e.stroke = c))} />
          <Num label="Grosor" value={el.strokeWidth} min={0} max={30} onChange={(n) => upd((e) => e.type === 'shape' && (e.strokeWidth = n))} />
        </div>
      )}
      {el.type === 'line' && (
        <div className="prop-section">
          <h4>Línea</h4>
          <ColorRow label="Color" value={el.stroke} allowNone={false} onChange={(c) => c && upd((e) => e.type === 'line' && (e.stroke = c))} />
          <Num label="Grosor" value={el.strokeWidth} min={1} max={30} onChange={(n) => upd((e) => e.type === 'line' && (e.strokeWidth = n))} />
          <div className="prop-row">
            <span>Trazo</span>
            <select className="select select-sm" value={el.dash ?? 'solid'} onChange={(e) => upd((x) => x.type === 'line' && (x.dash = e.target.value as 'solid'))}>
              <option value="solid">Continuo</option><option value="dash">Guiones</option><option value="dot">Puntos</option>
            </select>
          </div>
          <label className="checkbox"><input type="checkbox" checked={!!el.arrowEnd} onChange={(e) => upd((x) => x.type === 'line' && (x.arrowEnd = e.target.checked))} /> Flecha al final</label>
          <label className="checkbox"><input type="checkbox" checked={!!el.arrowStart} onChange={(e) => upd((x) => x.type === 'line' && (x.arrowStart = e.target.checked))} /> Flecha al inicio</label>
          <div className="row"><Button size="sm" onClick={() => upd((x) => x.type === 'line' && (x.flipV = !x.flipV))}>Invertir dirección</Button></div>
        </div>
      )}
      {el.type === 'image' && (
        <div className="prop-section">
          <h4>Imagen</h4>
          <div className="prop-row">
            <span>Ajuste</span>
            <select className="select select-sm" value={el.fit} onChange={(e) => upd((x) => x.type === 'image' && (x.fit = e.target.value as 'cover'))}>
              <option value="contain">Contener</option><option value="cover">Recortar para llenar</option><option value="fill">Estirar</option>
            </select>
          </div>
          <Num label="Esquinas" value={el.radius ?? 0} min={0} max={500} onChange={(n) => upd((x) => x.type === 'image' && (x.radius = n))} />
          <div className="field">
            <label className="field-label" htmlFor="img-alt">Texto alternativo</label>
            <input id="img-alt" className="input input-sm" value={el.alt} onFocus={() => store.checkpoint()} onChange={(e) => store.updateElements(ids, (x) => x.type === 'image' && (x.alt = e.target.value), { history: false })} />
          </div>
          <Button size="sm" onClick={async () => {
            const [f] = await pickFiles('image/*');
            if (!f) return;
            if (f.size > 15 * 1024 * 1024) return toast.error('La imagen supera los 15 MB.');
            const src = await blobToDataUrl(f);
            upd((x) => x.type === 'image' && (x.src = src));
          }}>Reemplazar imagen…</Button>
        </div>
      )}
      {el.type === 'table' && sel.length === 1 && <TableEditor store={store} el={el} />}
      <div className="prop-section">
        <h4>Animación</h4>
        <select className="select select-sm" aria-label="Animación de entrada" value={sel.length === 1 ? el.animation?.type ?? '' : ''} onChange={(e) => upd({ animation: e.target.value ? { type: e.target.value as AnimationType } : null })}>
          {ANIMS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <p className="faint" style={{ fontSize: 12 }}>Las animaciones aparecen en orden de capas al avanzar en el modo presentación.</p>
      </div>
      <div className="row"><IconButton icon={Trash2} label="Eliminar" onClick={() => store.deleteSelected()} /></div>
    </aside>
  );
}
