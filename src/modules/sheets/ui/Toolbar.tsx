import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpAZ,
  Bold,
  ChartColumn,
  Euro,
  Filter,
  Grid3x3,
  Italic,
  Merge,
  PaintBucket,
  Percent,
  Printer,
  Redo2,
  Search,
  Sigma,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  WrapText,
  Snowflake,
} from 'lucide-react';
import { IconButton } from '@/ui/Button';
import { ColorPickerButton } from '@/ui/ColorPicker';
import { MenuButton, type MenuItem } from '@/ui/Menu';
import type { BorderDef, CellStyle, RangeAddr } from '../model';
import { NUMBER_FORMATS } from '../format/numberFormat';
import type { SheetController } from '../controller';

export const SHEET_FONTS = ['Calibri', 'Arial', 'Helvetica', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New', 'Segoe UI'];
export const SHEET_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

/** Aumenta o reduce los decimales del formato numérico. */
export function adjustDecimals(fmt: string | undefined, delta: number): string {
  const base = !fmt || fmt === 'General' ? '0' : fmt;
  return base.replace(/(0|#)(\.0*)?(?=[^0#.]*$|[%\s"€$;])/, (_m, d, dec) => {
    const n = Math.max(0, (dec ? dec.length - 1 : 0) + delta);
    return n ? `${d}.${'0'.repeat(n)}` : d;
  });
}

export function applyBorders(ctl: SheetController, range: RangeAddr, mode: string, color = '#000000') {
  const line: BorderDef = { style: mode === 'thick' ? 'medium' : 'thin', color };
  const r = range;
  ctl.applyStyle(
    r,
    (st, row, col) => {
      if (mode === 'none') {
        delete st.borders;
        return st;
      }
      const b = { ...(st.borders ?? {}) };
      const top = row === r.r1;
      const bottom = row === r.r2;
      const left = col === r.c1;
      const right = col === r.c2;
      if (mode === 'all') Object.assign(b, { top: line, bottom: line, left: line, right: line });
      if (mode === 'outer' || mode === 'thick') {
        if (top) b.top = line;
        if (bottom) b.bottom = line;
        if (left) b.left = line;
        if (right) b.right = line;
      }
      if (mode === 'bottom' && bottom) b.bottom = line;
      if (mode === 'top' && top) b.top = line;
      if (mode === 'left' && left) b.left = line;
      if (mode === 'right' && right) b.right = line;
      if (mode === 'inner') {
        if (!bottom) b.bottom = line;
        if (!right) b.right = line;
      }
      return { ...st, borders: b };
    },
    'Bordes',
  );
}

interface Props {
  ctl: SheetController;
  style: CellStyle;
  onPrint: () => void;
  onChart: () => void;
  onFind: () => void;
  onFilter: () => void;
  onSort: (asc: boolean) => void;
  onMerge: () => void;
  onAutoSum: (fn: string) => void;
  freezeItems: MenuItem[];
  hasFilter: boolean;
  merged: boolean;
}

export function SheetsToolbar({ ctl, style, onPrint, onChart, onFind, onFilter, onSort, onMerge, onAutoSum, freezeItems, hasFilter, merged }: Props) {
  const range = ctl.sel.range;
  const set = (patch: Partial<CellStyle>, label?: string) => ctl.applyStyle(range, patch, label);
  const fmtValue = NUMBER_FORMATS.find((f) => f.fmt === (style.numFmt ?? 'General'))?.id ?? 'custom';
  return (
    <div className="toolbar" role="toolbar" aria-label="Formato de celdas">
      <div className="toolbar-group">
        <IconButton icon={Undo2} label="Deshacer (Ctrl+Z)" disabled={!ctl.canUndo()} onClick={() => ctl.undo()} />
        <IconButton icon={Redo2} label="Rehacer (Ctrl+Y)" disabled={!ctl.canRedo()} onClick={() => ctl.redo()} />
        <IconButton icon={Printer} label="Imprimir (Ctrl+P)" onClick={onPrint} />
      </div>
      <div className="toolbar-sep" />
      <select className="select select-sm" aria-label="Formato numérico" value={fmtValue} style={{ width: 128 }}
        onChange={(e) => { const f = NUMBER_FORMATS.find((x) => x.id === e.target.value); if (f) set({ numFmt: f.fmt === 'General' ? undefined : f.fmt }, 'Formato numérico'); }}>
        {fmtValue === 'custom' && <option value="custom">{style.numFmt}</option>}
        {NUMBER_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <div className="toolbar-group">
        <IconButton icon={Euro} label="Formato de moneda" onClick={() => set({ numFmt: '#,##0.00 "€"' })} />
        <IconButton icon={Percent} label="Formato de porcentaje" onClick={() => set({ numFmt: '0%' })} />
        <button type="button" className="icon-btn" title="Reducir decimales" aria-label="Reducir decimales" onClick={() => set({ numFmt: adjustDecimals(style.numFmt, -1) })}>.0←</button>
        <button type="button" className="icon-btn" title="Aumentar decimales" aria-label="Aumentar decimales" onClick={() => set({ numFmt: adjustDecimals(style.numFmt, 1) })}>.00→</button>
      </div>
      <div className="toolbar-sep" />
      <select className="select select-sm" aria-label="Fuente" value={style.fontFamily ?? ''} style={{ width: 110 }} onChange={(e) => set({ fontFamily: e.target.value || undefined })}>
        <option value="">Predeterminada</option>
        {style.fontFamily && !SHEET_FONTS.includes(style.fontFamily) && <option value={style.fontFamily}>{style.fontFamily}</option>}
        {SHEET_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select className="select select-sm" aria-label="Tamaño de fuente" value={style.fontSize ?? 11} style={{ width: 60 }} onChange={(e) => set({ fontSize: Number(e.target.value) === 11 ? undefined : Number(e.target.value) })}>
        {!SHEET_SIZES.includes(style.fontSize ?? 11) && <option value={style.fontSize}>{style.fontSize}</option>}
        {SHEET_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="toolbar-group">
        <IconButton icon={Bold} label="Negrita (Ctrl+B)" active={!!style.bold} onClick={() => ctl.toggleStyle('bold')} />
        <IconButton icon={Italic} label="Cursiva (Ctrl+I)" active={!!style.italic} onClick={() => ctl.toggleStyle('italic')} />
        <IconButton icon={Underline} label="Subrayado (Ctrl+U)" active={!!style.underline} onClick={() => ctl.toggleStyle('underline')} />
        <IconButton icon={Strikethrough} label="Tachado" active={!!style.strike} onClick={() => ctl.toggleStyle('strike')} />
        <ColorPickerButton label="Color del texto" value={style.color} allowNone noneLabel="Automático" onChange={(c) => set({ color: c ?? undefined })}>
          <span className="color-indicator"><Type size={16} /><span className="color-bar" style={{ background: style.color ?? 'currentColor' }} /></span>
        </ColorPickerButton>
        <ColorPickerButton label="Color de relleno" value={style.bg} allowNone noneLabel="Sin relleno" onChange={(c) => set({ bg: c ?? undefined })}>
          <span className="color-indicator"><PaintBucket size={16} /><span className="color-bar" style={{ background: style.bg ?? 'transparent' }} /></span>
        </ColorPickerButton>
        <MenuButton className="icon-btn" label="Bordes" items={[
          { label: 'Todos los bordes', onSelect: () => applyBorders(ctl, range, 'all') },
          { label: 'Borde exterior', onSelect: () => applyBorders(ctl, range, 'outer') },
          { label: 'Borde exterior grueso', onSelect: () => applyBorders(ctl, range, 'thick') },
          { label: 'Bordes interiores', onSelect: () => applyBorders(ctl, range, 'inner') },
          { label: 'Borde inferior', onSelect: () => applyBorders(ctl, range, 'bottom') },
          { label: 'Borde superior', onSelect: () => applyBorders(ctl, range, 'top') },
          { label: 'Borde izquierdo', onSelect: () => applyBorders(ctl, range, 'left') },
          { label: 'Borde derecho', onSelect: () => applyBorders(ctl, range, 'right') },
          { type: 'separator' },
          { label: 'Sin bordes', onSelect: () => applyBorders(ctl, range, 'none') },
        ]}><Grid3x3 size={17} /></MenuButton>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={AlignLeft} label="Alinear a la izquierda" active={style.hAlign === 'left'} onClick={() => set({ hAlign: style.hAlign === 'left' ? undefined : 'left' })} />
        <IconButton icon={AlignCenter} label="Centrar" active={style.hAlign === 'center'} onClick={() => set({ hAlign: style.hAlign === 'center' ? undefined : 'center' })} />
        <IconButton icon={AlignRight} label="Alinear a la derecha" active={style.hAlign === 'right'} onClick={() => set({ hAlign: style.hAlign === 'right' ? undefined : 'right' })} />
        <MenuButton className="icon-btn" label="Alineación vertical" items={[
          { label: 'Arriba', checked: style.vAlign === 'top', onSelect: () => set({ vAlign: 'top' }) },
          { label: 'En medio', checked: style.vAlign === 'middle', onSelect: () => set({ vAlign: 'middle' }) },
          { label: 'Abajo', checked: !style.vAlign || style.vAlign === 'bottom', onSelect: () => set({ vAlign: undefined }) },
        ]}><span style={{ fontSize: 12, fontWeight: 600 }}>⇕</span></MenuButton>
        <IconButton icon={WrapText} label="Ajustar texto" active={!!style.wrap} onClick={() => ctl.toggleStyle('wrap')} />
        <IconButton icon={Merge} label={merged ? 'Separar celdas' : 'Combinar celdas'} active={merged} onClick={onMerge} />
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <MenuButton className="icon-btn" label="Autosuma y funciones" items={['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].map((fn) => ({
          label: { SUM: 'Suma', AVERAGE: 'Promedio', COUNT: 'Contar números', MAX: 'Máximo', MIN: 'Mínimo' }[fn]!,
          shortcut: fn === 'SUM' ? 'Alt+=' : undefined,
          onSelect: () => onAutoSum(fn),
        }))}><Sigma size={17} /></MenuButton>
        <IconButton icon={ArrowDownAZ} label="Ordenar de A a Z" onClick={() => onSort(true)} />
        <IconButton icon={ArrowUpAZ} label="Ordenar de Z a A" onClick={() => onSort(false)} />
        <IconButton icon={Filter} label={hasFilter ? 'Quitar filtro (Ctrl+Mayús+L)' : 'Crear filtro (Ctrl+Mayús+L)'} active={hasFilter} onClick={onFilter} />
        <MenuButton className="icon-btn" label="Inmovilizar" items={freezeItems}><Snowflake size={17} /></MenuButton>
        <IconButton icon={ChartColumn} label="Insertar gráfico" onClick={onChart} />
        <IconButton icon={Search} label="Buscar y reemplazar (Ctrl+F)" onClick={onFind} />
      </div>
    </div>
  );
}
