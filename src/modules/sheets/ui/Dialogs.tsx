import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog } from '@/ui/Dialog';
import { Button, IconButton } from '@/ui/Button';
import { createId } from '@/core/util/id';
import { parseRangeRef, rangeName } from '../engine/address';
import type { ChartDef, ConditionalRule, ConditionType, RangeAddr, ValidationRule } from '../model';
import type { SheetController } from '../controller';
import { CHART_TYPES, ChartSvg, chartData } from '../charts';

const COND_LABELS: Record<ConditionType, string> = {
  gt: 'Mayor que',
  gte: 'Mayor o igual que',
  lt: 'Menor que',
  lte: 'Menor o igual que',
  eq: 'Igual a',
  neq: 'Distinto de',
  between: 'Entre',
  contains: 'El texto contiene',
  notContains: 'El texto no contiene',
  empty: 'Está vacía',
  notEmpty: 'No está vacía',
  duplicate: 'Valores duplicados',
  colorScale: 'Escala de color (mín → máx)',
};

const PRESETS = [
  { label: 'Relleno rojo claro, texto rojo oscuro', bg: '#fee2e2', color: '#991b1b' },
  { label: 'Relleno verde claro, texto verde oscuro', bg: '#dcfce7', color: '#166534' },
  { label: 'Relleno amarillo, texto marrón', bg: '#fef9c3', color: '#854d0e' },
  { label: 'Relleno azul claro', bg: '#dbeafe', color: '#1e3a8a' },
  { label: 'Texto rojo en negrita', bg: '', color: '#dc2626', bold: true },
];

function RangeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder="A1:B10" />
    </div>
  );
}

function parseLocalRange(text: string): RangeAddr | null {
  const p = parseRangeRef(text);
  return p && !p.sheet ? p.range : null;
}

export function ConditionalFormatDialog({ open, onClose, ctl }: { open: boolean; onClose: () => void; ctl: SheetController }) {
  const [range, setRange] = useState('');
  const [type, setType] = useState<ConditionType>('gt');
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [preset, setPreset] = useState(0);
  const [colors, setColors] = useState<[string, string]>(['#f8696b', '#63be7b']);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setRange(rangeName(ctl.sel.range));
      setError('');
    }
  }, [open, ctl]);
  const rules = ctl.sheet.conditional;
  const needsV1 = !['empty', 'notEmpty', 'duplicate', 'colorScale'].includes(type);

  const add = () => {
    const r = parseLocalRange(range);
    if (!r) return setError('El rango no es válido.');
    if (needsV1 && v1 === '') return setError('Indica un valor.');
    const p = PRESETS[preset];
    const rule: ConditionalRule = {
      id: createId('cf'),
      range: r,
      type,
      values: type === 'between' ? [v1, v2] : needsV1 ? [v1] : [],
      style: { bg: p.bg || undefined, color: p.color, bold: p.bold },
      ...(type === 'colorScale' ? { colors } : {}),
    };
    ctl.sheetOp('Formato condicional', (s) => s.conditional.push(rule), { rebuild: false });
    setV1('');
    setV2('');
  };

  return (
    <Dialog open={open} onClose={onClose} title="Formato condicional" width={620} footer={<Button variant="primary" onClick={onClose}>Cerrar</Button>}>
      <div className="field-row">
        <RangeField id="cf-range" label="Aplicar al rango" value={range} onChange={setRange} />
        <div className="field">
          <label className="field-label" htmlFor="cf-type">Regla</label>
          <select id="cf-type" className="select" value={type} onChange={(e) => setType(e.target.value as ConditionType)}>
            {Object.entries(COND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      {needsV1 && (
        <div className="field-row">
          <div className="field"><label className="field-label" htmlFor="cf-v1">Valor</label><input id="cf-v1" className="input" value={v1} onChange={(e) => setV1(e.target.value)} /></div>
          {type === 'between' && <div className="field"><label className="field-label" htmlFor="cf-v2">y</label><input id="cf-v2" className="input" value={v2} onChange={(e) => setV2(e.target.value)} /></div>}
        </div>
      )}
      {type === 'colorScale' ? (
        <div className="field-row">
          <div className="field"><label className="field-label" htmlFor="cf-c1">Color del mínimo</label><input id="cf-c1" type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} /></div>
          <div className="field"><label className="field-label" htmlFor="cf-c2">Color del máximo</label><input id="cf-c2" type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} /></div>
        </div>
      ) : (
        <div className="field">
          <label className="field-label" htmlFor="cf-style">Formato</label>
          <select id="cf-style" className="select" value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
            {PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <Button variant="primary" onClick={add}>Añadir regla</Button>
      <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Reglas de esta hoja</h3>
      {rules.length === 0 ? <p className="muted">No hay reglas.</p> : (
        <table className="table-simple">
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{rangeName(r.range)}</td>
                <td>{COND_LABELS[r.type]} {r.values.join(' y ')}</td>
                <td><span className="badge" style={{ background: r.style.bg, color: r.style.color, fontWeight: r.style.bold ? 700 : 400 }}>Ejemplo</span></td>
                <td><IconButton icon={Trash2} label="Eliminar regla" onClick={() => ctl.sheetOp('Eliminar regla', (s) => { s.conditional = s.conditional.filter((x) => x.id !== r.id); }, { rebuild: false })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

export function ValidationDialog({ open, onClose, ctl }: { open: boolean; onClose: () => void; ctl: SheetController }) {
  const [range, setRange] = useState('');
  const [type, setType] = useState<ValidationRule['type']>('list');
  const [items, setItems] = useState('Sí, No');
  const [source, setSource] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [strict, setStrict] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setRange(rangeName(ctl.sel.range));
      setError('');
    }
  }, [open, ctl]);
  const existing = ctl.sheet.validations;

  const save = () => {
    const r = parseLocalRange(range);
    if (!r) return setError('El rango no es válido.');
    if (type === 'list' && !source && !items.trim()) return setError('Indica los elementos de la lista.');
    if (source && !parseRangeRef(source)) return setError('El rango de origen no es válido.');
    const rule: ValidationRule = {
      id: createId('dv'),
      range: r,
      type,
      values: type === 'list' ? items.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean) : [min, max],
      source: type === 'list' && source ? source : undefined,
      allowBlank: true,
      strict,
      message: message || undefined,
    };
    ctl.sheetOp('Validación de datos', (s) => {
      s.validations = s.validations.filter((v) => !(v.range.r1 === r.r1 && v.range.c1 === r.c1 && v.range.r2 === r.r2 && v.range.c2 === r.c2));
      s.validations.push(rule);
    }, { rebuild: false });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Validación de datos" width={560}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Guardar</Button></>}>
      <div className="field-row">
        <RangeField id="dv-range" label="Rango" value={range} onChange={setRange} />
        <div className="field">
          <label className="field-label" htmlFor="dv-type">Permitir</label>
          <select id="dv-type" className="select" value={type} onChange={(e) => setType(e.target.value as ValidationRule['type'])}>
            <option value="list">Lista desplegable</option>
            <option value="number">Número</option>
            <option value="integer">Número entero</option>
            <option value="date">Fecha</option>
            <option value="textLength">Longitud del texto</option>
          </select>
        </div>
      </div>
      {type === 'list' ? (
        <>
          <div className="field"><label className="field-label" htmlFor="dv-items">Elementos (separados por comas)</label><input id="dv-items" className="input" value={items} onChange={(e) => setItems(e.target.value)} disabled={!!source} /></div>
          <div className="field"><label className="field-label" htmlFor="dv-src">…o tomar la lista de un rango (opcional)</label><input id="dv-src" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Hoja2!A1:A10" /></div>
        </>
      ) : (
        <div className="field-row">
          <div className="field"><label className="field-label" htmlFor="dv-min">Mínimo</label><input id="dv-min" className="input" value={min} onChange={(e) => setMin(e.target.value)} placeholder={type === 'date' ? '01/01/2025' : '0'} /></div>
          <div className="field"><label className="field-label" htmlFor="dv-max">Máximo</label><input id="dv-max" className="input" value={max} onChange={(e) => setMax(e.target.value)} /></div>
        </div>
      )}
      <div className="field"><label className="field-label" htmlFor="dv-msg">Mensaje de error (opcional)</label><input id="dv-msg" className="input" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
      <label className="checkbox"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> Rechazar valores no válidos (si no, solo se avisa)</label>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {existing.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Reglas existentes</h3>
          <table className="table-simple"><tbody>
            {existing.map((v) => (
              <tr key={v.id}>
                <td>{rangeName(v.range)}</td>
                <td>{v.type === 'list' ? `Lista: ${v.source ?? v.values.join(', ')}` : `${v.type} ${v.values.filter(Boolean).join(' – ')}`}</td>
                <td><IconButton icon={Trash2} label="Eliminar validación" onClick={() => ctl.sheetOp('Quitar validación', (s) => { s.validations = s.validations.filter((x) => x.id !== v.id); }, { rebuild: false })} /></td>
              </tr>
            ))}
          </tbody></table>
        </>
      )}
    </Dialog>
  );
}

export function ChartDialog({ open, onClose, ctl, chart }: { open: boolean; onClose: () => void; ctl: SheetController; chart: ChartDef | null }) {
  const [draft, setDraft] = useState<ChartDef | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    if (chart) setDraft({ ...chart });
    else {
      const sel = ctl.sel.range;
      const region = sel.r1 === sel.r2 && sel.c1 === sel.c2 ? ctl.currentRegion(ctl.sel.r, ctl.sel.c) : sel;
      const scrollEl = document.querySelector('.grid-scroll') as HTMLElement | null;
      setDraft({
        id: createId('ch'),
        type: 'column',
        range: rangeName(region),
        title: '',
        x: (scrollEl?.scrollLeft ?? 0) + 120,
        y: (scrollEl?.scrollTop ?? 0) + 40,
        w: 480,
        h: 300,
        headers: true,
        seriesIn: 'columns',
        legend: true,
      });
    }
  }, [open, chart, ctl]);
  if (!draft) return null;
  const data = chartData(ctl, draft, ctl.sheet.id);
  const save = () => {
    if (!parseRangeRef(draft.range)) return setError('El rango de datos no es válido.');
    ctl.sheetOp(chart ? 'Editar gráfico' : 'Insertar gráfico', (s) => {
      const i = s.charts.findIndex((c) => c.id === draft.id);
      if (i >= 0) s.charts[i] = draft;
      else s.charts.push(draft);
    }, { rebuild: false });
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title={chart ? 'Editar gráfico' : 'Insertar gráfico'} width={760}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{chart ? 'Guardar' : 'Insertar'}</Button></>}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}>
          <div className="field">
            <label className="field-label" htmlFor="ch-type">Tipo</label>
            <select id="ch-type" className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ChartDef['type'] })}>
              {CHART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field"><label className="field-label" htmlFor="ch-range">Rango de datos</label><input id="ch-range" className="input" value={draft.range} onChange={(e) => setDraft({ ...draft, range: e.target.value })} /></div>
          <div className="field"><label className="field-label" htmlFor="ch-title">Título</label><input id="ch-title" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="field">
            <label className="field-label" htmlFor="ch-series">Series en</label>
            <select id="ch-series" className="select" value={draft.seriesIn} onChange={(e) => setDraft({ ...draft, seriesIn: e.target.value as 'columns' })}>
              <option value="columns">Columnas</option><option value="rows">Filas</option>
            </select>
          </div>
          <label className="checkbox"><input type="checkbox" checked={draft.headers} onChange={(e) => setDraft({ ...draft, headers: e.target.checked })} /> La primera fila contiene encabezados</label>
          <br />
          <label className="checkbox"><input type="checkbox" checked={draft.legend} onChange={(e) => setDraft({ ...draft, legend: e.target.checked })} /> Mostrar leyenda</label>
          {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <ChartSvg chart={draft} data={data} width={400} height={260} />
        </div>
      </div>
    </Dialog>
  );
}
