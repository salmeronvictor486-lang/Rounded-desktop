import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button, IconButton } from '@/ui/Button';
import { toast } from '@/ui/toast';
import { cellName } from '../engine/address';
import type { SheetController } from '../controller';
import { findAll, replaceIn, type FindMatch, type FindOptions } from '../ops/find';
import { columnValues, setFilterHidden, sortRange } from '../ops/sortFilter';

export function FindPanel({ ctl, version, onClose, focusReplace }: { ctl: SheetController; version: number; onClose: () => void; focusReplace?: boolean }) {
  const [q, setQ] = useState('');
  const [repl, setRepl] = useState('');
  const [opts, setOpts] = useState<FindOptions>({ matchCase: false, wholeCell: false, inFormulas: false, allSheets: false });
  const [idx, setIdx] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const replRef = useRef<HTMLInputElement>(null);
  useEffect(() => (focusReplace ? replRef : findRef).current?.focus(), [focusReplace]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matches = useMemo(() => findAll(ctl, q, opts), [ctl, q, opts, version]);
  const go = (i: number) => {
    if (!matches.length) return;
    const n = (i + matches.length) % matches.length;
    setIdx(n);
    const m: FindMatch = matches[n];
    ctl.setActiveSheet(m.sheetIndex);
    ctl.select(m.r, m.c);
  };
  const opt = (k: keyof FindOptions, label: string) => (
    <label className="checkbox"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <aside className="side-panel" aria-label="Buscar y reemplazar" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="row" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Buscar y reemplazar</h3>
        <div className="spacer" />
        <IconButton icon={X} label="Cerrar" onClick={onClose} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sf-q">Buscar</label>
        <input ref={findRef} id="sf-q" className="input" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? idx - 1 : matches.length && ctl.sel.r === matches[idx]?.r && ctl.sel.c === matches[idx]?.c ? idx + 1 : idx); } }} />
        <div className="row" style={{ marginTop: 6 }}>
          <span className="muted" aria-live="polite">{q ? (matches.length ? `${idx + 1} de ${matches.length}` : 'Sin resultados') : ''}</span>
          <div className="spacer" />
          <IconButton icon={ChevronUp} label="Anterior" disabled={!matches.length} onClick={() => go(idx - 1)} />
          <IconButton icon={ChevronDown} label="Siguiente" disabled={!matches.length} onClick={() => go(idx + 1)} />
        </div>
      </div>
      <div className="stack" style={{ marginBottom: 14 }}>
        {opt('matchCase', 'Coincidir mayúsculas y minúsculas')}
        {opt('wholeCell', 'Coincidir todo el contenido de la celda')}
        {opt('inFormulas', 'Buscar también en fórmulas')}
        {opt('allSheets', 'Buscar en todas las hojas')}
      </div>
      <div className="field"><label className="field-label" htmlFor="sf-r">Reemplazar por</label><input ref={replRef} id="sf-r" className="input" value={repl} onChange={(e) => setRepl(e.target.value)} /></div>
      <div className="row">
        <Button size="sm" disabled={!matches.length} onClick={() => { const n = replaceIn(ctl, [matches[idx]], q, repl, opts); if (n) go(idx); }}>Reemplazar</Button>
        <Button size="sm" variant="primary" disabled={!matches.length} onClick={() => toast.info(`${replaceIn(ctl, matches, q, repl, opts)} reemplazo(s).`)}>Reemplazar todo</Button>
      </div>
      {matches.length > 0 && (
        <ul className="find-results">
          {matches.slice(0, 200).map((m, i) => (
            <li key={`${m.sheetIndex}-${m.r}-${m.c}`}>
              <button type="button" className={i === idx ? 'is-current' : ''} onClick={() => go(i)}>
                {opts.allSheets ? `${ctl.wb.sheets[m.sheetIndex].name}!` : ''}{cellName(m.r, m.c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Menú desplegable del filtro de una columna. */
export function FilterPopover({ ctl, col, anchor, onClose }: { ctl: SheetController; col: number; anchor: HTMLElement; onClose: () => void }) {
  const sheet = ctl.sheet;
  const values = columnValues(ctl, sheet, col);
  const [hidden, setHidden] = useState<Set<string>>(new Set(sheet.filter?.hidden[col] ?? []));
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const r = anchor.getBoundingClientRect();
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  const shown = values.filter((v) => v.value.toLowerCase().includes(search.toLowerCase()));
  const f = sheet.filter!;
  return createPortal(
    <div ref={ref} className="filter-popover" style={{ left: Math.min(r.left, window.innerWidth - 270), top: r.bottom + 4 }} role="dialog" aria-label="Filtro" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <button type="button" className="menu-item" onClick={() => { sortRange(ctl, f.range, [{ col, asc: true }], true); onClose(); }}><ArrowDownAZ size={15} /> Ordenar de A a Z</button>
      <button type="button" className="menu-item" onClick={() => { sortRange(ctl, f.range, [{ col, asc: false }], true); onClose(); }}><ArrowUpAZ size={15} /> Ordenar de Z a A</button>
      <div className="menu-sep" />
      <input className="input input-sm" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar valores" autoFocus />
      <div className="row" style={{ margin: '6px 0' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHidden(new Set())}>Seleccionar todo</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHidden(new Set(values.map((v) => v.value)))}>Ninguno</button>
      </div>
      <div className="filter-values">
        {shown.map((v) => (
          <label key={v.value} className="checkbox">
            <input type="checkbox" checked={!hidden.has(v.value)} onChange={(e) => {
              const n = new Set(hidden);
              if (e.target.checked) n.delete(v.value); else n.add(v.value);
              setHidden(n);
            }} />
            <span>{v.value === '' ? '(Vacías)' : v.value}</span>
            <span className="faint" style={{ marginLeft: 'auto' }}>{v.count}</span>
          </label>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <Button size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" variant="primary" onClick={() => { setFilterHidden(ctl, col, Array.from(hidden)); onClose(); }}>Aceptar</Button>
      </div>
    </div>,
    document.body,
  );
}
