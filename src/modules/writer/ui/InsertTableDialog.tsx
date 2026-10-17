import { useState } from 'react';
import { Dialog } from '@/ui/Dialog';
import { Button } from '@/ui/Button';

/** Selector de tamaño de tabla (cuadrícula o valores numéricos). */
export function InsertTableDialog({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (rows: number, cols: number, header: boolean) => void }) {
  const [hover, setHover] = useState({ r: 3, c: 3 });
  const [header, setHeader] = useState(true);
  const N = 10;
  return (
    <Dialog open={open} onClose={onClose} title="Insertar tabla" width={380}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { onInsert(hover.r, hover.c, header); onClose(); }}>Insertar {hover.r} × {hover.c}</Button></>}>
      <div className="table-picker" role="grid" aria-label="Tamaño de la tabla">
        {Array.from({ length: N }, (_, r) => (
          <div key={r} role="row" className="table-picker-row">
            {Array.from({ length: N }, (_, c) => (
              <button key={c} type="button" role="gridcell" aria-label={`${r + 1} filas × ${c + 1} columnas`}
                className={`table-picker-cell ${r < hover.r && c < hover.c ? 'is-on' : ''}`}
                onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                onFocus={() => setHover({ r: r + 1, c: c + 1 })}
                onClick={() => { onInsert(r + 1, c + 1, header); onClose(); }} />
            ))}
          </div>
        ))}
      </div>
      <div className="field-row" style={{ marginTop: 12 }}>
        <div className="field"><label className="field-label" htmlFor="tbl-r">Filas</label><input id="tbl-r" className="input" type="number" min={1} max={200} value={hover.r} onChange={(e) => setHover({ ...hover, r: Math.max(1, Math.min(200, Number(e.target.value))) })} /></div>
        <div className="field"><label className="field-label" htmlFor="tbl-c">Columnas</label><input id="tbl-c" className="input" type="number" min={1} max={30} value={hover.c} onChange={(e) => setHover({ ...hover, c: Math.max(1, Math.min(30, Number(e.target.value))) })} /></div>
      </div>
      <label className="checkbox"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> Primera fila como encabezado</label>
    </Dialog>
  );
}
