import { useEffect, useState } from 'react';
import { Dialog } from '@/ui/Dialog';
import { Button } from '@/ui/Button';
import { PAPER_SIZES, type PageSettings, type PaperSize } from '../model';

export function PageSetupDialog({ open, page, onClose, onApply }: { open: boolean; page: PageSettings; onClose: () => void; onApply: (p: PageSettings) => void }) {
  const [draft, setDraft] = useState(page);
  useEffect(() => {
    if (open) setDraft(structuredClone(page));
  }, [open, page]);
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v.replace(',', '.')) || 0));
  const margin = (k: keyof PageSettings['margins'], label: string) => (
    <div className="field">
      <label className="field-label" htmlFor={`m-${k}`}>{label} (mm)</label>
      <input id={`m-${k}`} className="input" type="number" min={0} max={100} step={0.5} value={draft.margins[k]}
        onChange={(e) => setDraft({ ...draft, margins: { ...draft.margins, [k]: num(e.target.value, 0, 100) } })} />
    </div>
  );
  return (
    <Dialog open={open} onClose={onClose} title="Configurar página" width={560}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { onApply(draft); onClose(); }}>Aplicar</Button></>}>
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="ps-size">Tamaño del papel</label>
          <select id="ps-size" className="select" value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value as PaperSize })}>
            {Object.entries(PAPER_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ps-orient">Orientación</label>
          <select id="ps-orient" className="select" value={draft.orientation} onChange={(e) => setDraft({ ...draft, orientation: e.target.value as 'portrait' })}>
            <option value="portrait">Vertical</option>
            <option value="landscape">Horizontal</option>
          </select>
        </div>
      </div>
      <div className="field-row">{margin('top', 'Superior')}{margin('bottom', 'Inferior')}{margin('left', 'Izquierdo')}{margin('right', 'Derecho')}</div>
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="ps-cols">Columnas</label>
          <select id="ps-cols" className="select" value={draft.columns} onChange={(e) => setDraft({ ...draft, columns: Number(e.target.value) as 1 })}>
            <option value={1}>Una</option><option value={2}>Dos</option><option value={3}>Tres</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ps-gap">Espacio entre columnas (mm)</label>
          <input id="ps-gap" className="input" type="number" min={0} max={50} value={draft.columnGap} disabled={draft.columns === 1}
            onChange={(e) => setDraft({ ...draft, columnGap: num(e.target.value, 0, 50) })} />
        </div>
      </div>
      {(['header', 'footer'] as const).map((k) => (
        <div className="field-row" key={k}>
          <div className="field" style={{ flex: 3 }}>
            <label className="field-label" htmlFor={`ps-${k}`}>{k === 'header' ? 'Encabezado' : 'Pie de página'}</label>
            <input id={`ps-${k}`} className="input" value={draft[k].text} placeholder="Usa {page} y {pages} para numerar: Página {page} de {pages}"
              onChange={(e) => setDraft({ ...draft, [k]: { ...draft[k], text: e.target.value } })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label" htmlFor={`ps-${k}-al`}>Alineación</label>
            <select id={`ps-${k}-al`} className="select" value={draft[k].align} onChange={(e) => setDraft({ ...draft, [k]: { ...draft[k], align: e.target.value as 'left' } })}>
              <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
            </select>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => setDraft({ ...draft, footer: { text: 'Página {page} de {pages}', align: 'center' } })}>Numerar páginas en el pie</Button>
        <label className="checkbox">
          <input type="checkbox" checked={draft.differentFirstPage} onChange={(e) => setDraft({ ...draft, differentFirstPage: e.target.checked })} />
          Primera página diferente (sin encabezado ni pie)
        </label>
      </div>
    </Dialog>
  );
}
