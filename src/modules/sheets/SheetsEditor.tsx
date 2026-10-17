import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Plus, Printer } from 'lucide-react';
import type { EditorProps } from '@/app/types';
import { EditorShell, useCommonFileItems, type MenuDef } from '@/app/EditorShell';
import { downloadBlob } from '@/core/files/download';
import { printHtml } from '@/core/files/print';
import { MenuList, useMenu, type MenuItem } from '@/ui/Menu';
import { alertDialog, confirmDialog, promptDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import { cellName, colToLetters, parseRangeRef, rangeName } from './engine/address';
import { formatValue } from './format/numberFormat';
import { getLocale } from './format/locale';
import { jsDateToSerial } from './engine/dates';
import { SheetController } from './controller';
import { DEFAULT_COL_WIDTH, normalizeRange, type ChartDef, type Workbook } from './model';
import { copyRange, pasteAt, toHtmlTable } from './ops/clipboard';
import { fillRange } from './ops/fill';
import { listOptions } from './ops/validation';
import { setFilter, sortRange } from './ops/sortFilter';
import { addSheet, changeStructure, deleteSheet, duplicateSheet, mergeCells, moveSheet, renameSheet, unmergeCells } from './ops/structure';
import { SHEETS_EXPORTS } from './formats';
import { buildSheetPrintHtml } from './print';
import { Grid, measureFontCss, type HeaderHit } from './ui/Grid';
import type { EditState } from './ui/CellEditor';
import { SheetsToolbar } from './ui/Toolbar';
import { ChartDialog, ConditionalFormatDialog, ValidationDialog } from './ui/Dialogs';
import { FilterPopover, FindPanel } from './ui/Panels';
import './sheets.css';

export default function SheetsEditor({ session }: EditorProps<Workbook>) {
  const ctl = useMemo(() => new SheetController(session.initialContent), [session]);
  const version = useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [panel, setPanel] = useState<null | 'find' | 'replace'>(null);
  const [dialog, setDialog] = useState<null | 'cf' | 'dv' | 'chart'>(null);
  const [editingChart, setEditingChart] = useState<ChartDef | null>(null);
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ col: number; anchor: HTMLElement } | null>(null);
  const [listMenu, setListMenu] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const ctxMenu = useMenu();

  useEffect(() => {
    ctl.onChange = () => session.markDirty();
    session.setSerializer(() => ctl.serialize());
  }, [ctl, session]);

  // Recalcular funciones volátiles cada minuto
  useEffect(() => {
    const t = setInterval(() => {
      ctl.engine.recalcVolatile();
      ctl.emit(false);
    }, 60_000);
    return () => clearInterval(t);
  }, [ctl]);

  const sheet = ctl.sheet;
  const sel = ctl.sel;
  const activeCell = ctl.getCell(sel.r, sel.c);
  const activeStyle = ctl.styleOf(activeCell);

  const focusGrid = () => requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));

  const commitEdit = useCallback(
    (move: { dr: number; dc: number } | null, opts: { fillSelection?: boolean } = {}) => {
      if (!edit) return;
      const problem = ctl.validate(edit.r, edit.c, edit.value);
      if (problem) {
        if (problem.strict) {
          void alertDialog({ title: 'Valor no válido', message: problem.message });
          return;
        }
        toast.warning(problem.message);
      }
      const range = ctl.sel.range;
      if (opts.fillSelection && (range.r1 !== range.r2 || range.c1 !== range.c2)) ctl.fillRangeWithInput(range, edit.value, { r: edit.r, c: edit.c });
      else if (edit.value !== ctl.rawInput(edit.r, edit.c)) ctl.setCellInput(edit.r, edit.c, edit.value);
      setEdit(null);
      if (move) {
        const m = ctl.mergeAt(edit.r, edit.c);
        const r = move.dr > 0 && m ? m.r2 + 1 : edit.r + move.dr;
        const c = move.dc > 0 && m ? m.c2 + 1 : edit.c + move.dc;
        ctl.select(Math.max(0, r), Math.max(0, c));
      }
      focusGrid();
    },
    [edit, ctl],
  );

  const startEdit = (value?: string) => {
    const m = ctl.mergeAt(sel.r, sel.c);
    const r = m ? m.r1 : sel.r;
    const c = m ? m.c1 : sel.c;
    setEdit({ r, c, value: value ?? ctl.rawInput(r, c), mode: value !== undefined ? 'enter' : 'edit' });
  };

  const autoSum = (fn: string) => {
    const r = sel.range;
    // Suma la columna de números encima (o la fila a la izquierda) de la celda activa
    let target = { r: sel.r, c: sel.c };
    let src = '';
    if (r.r1 !== r.r2 || r.c1 !== r.c2) {
      target = { r: r.r2 + 1, c: r.c1 };
      src = rangeName({ r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c1 });
    } else {
      let top = sel.r - 1;
      while (top >= 0 && typeof ctl.value(top, sel.c) === 'number') top--;
      if (top < sel.r - 1) src = rangeName({ r1: top + 1, c1: sel.c, r2: sel.r - 1, c2: sel.c });
      else {
        let left = sel.c - 1;
        while (left >= 0 && typeof ctl.value(sel.r, left) === 'number') left--;
        if (left < sel.c - 1) src = rangeName({ r1: sel.r, c1: left + 1, r2: sel.r, c2: sel.c - 1 });
      }
    }
    ctl.select(target.r, target.c);
    setEdit({ r: target.r, c: target.c, value: `=${fn}(${src})`, mode: 'edit' });
  };

  const sortSelection = (asc: boolean) => {
    const r = sel.range;
    const single = r.r1 === r.r2 && r.c1 === r.c2;
    const region = single || (r.c1 === r.c2 && r.r1 === 0 && r.r2 >= sheet.rowCount - 1) ? ctl.currentRegion(sel.r, sel.c) : r;
    // Detectar encabezado: primera fila de texto sobre datos numéricos
    const first = ctl.value(region.r1, sel.c);
    const second = ctl.value(region.r1 + 1, sel.c);
    const header = typeof first === 'string' && (typeof second === 'number' || region.r1 === sheet.filter?.range.r1);
    sortRange(ctl, region, [{ col: sel.c, asc }], header);
  };

  const toggleFilter = () => {
    if (sheet.filter) setFilter(ctl, null);
    else {
      const r = sel.range;
      const region = r.r1 === r.r2 && r.c1 === r.c2 ? ctl.currentRegion(sel.r, sel.c) : r;
      if (region.r1 === region.r2) return toast.warning('Selecciona una tabla con encabezados para crear un filtro.');
      setFilter(ctl, region);
    }
  };

  const merged = !!sheet.merges.find((m) => m.r1 <= sel.range.r2 && sel.range.r1 <= m.r2 && m.c1 <= sel.range.c2 && sel.range.c1 <= m.c2);
  const toggleMerge = () => {
    if (merged) unmergeCells(ctl, sel.range);
    else {
      const hasData = Array.from(ctl.cellsIn(sel.range)).filter(([r, c, cell]) => !(r === sel.range.r1 && c === sel.range.c1) && (cell.v !== undefined || cell.f !== undefined)).length;
      if (hasData) {
        void confirmDialog({ title: 'Combinar celdas', message: 'Solo se conservará el valor de la celda superior izquierda. ¿Continuar?', confirmLabel: 'Combinar' }).then((ok) => ok && mergeCells(ctl, sel.range));
      } else mergeCells(ctl, sel.range);
    }
  };

  const autoFit = (axis: 'col' | 'row', index: number) => {
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d')!;
    if (axis === 'col') {
      let max = 30;
      for (const [k, cell] of Object.entries(sheet.cells)) {
        const c = Number(k.slice(k.indexOf(',') + 1));
        if (c !== index) continue;
        const r = Number(k.slice(0, k.indexOf(',')));
        const st = ctl.styleOf(cell);
        g.font = measureFontCss(st);
        const text = formatValue(ctl.value(r, c), st.numFmt).text;
        max = Math.max(max, g.measureText(text).width + 14);
      }
      ctl.sheetOp('Autoajustar columna', (s) => { s.colWidths[index] = Math.min(600, Math.ceil(max)); }, { rebuild: false });
    } else {
      ctl.sheetOp('Autoajustar fila', (s) => { delete s.rowHeights[index]; }, { rebuild: false });
    }
  };

  const freezeItems: MenuItem[] = [
    { label: 'No inmovilizar', checked: sheet.freeze.rows === 0 && sheet.freeze.cols === 0, onSelect: () => ctl.sheetOp('Inmovilizar', (s) => { s.freeze = { rows: 0, cols: 0 }; }, { rebuild: false }) },
    { label: 'Primera fila', checked: sheet.freeze.rows === 1 && sheet.freeze.cols === 0, onSelect: () => ctl.sheetOp('Inmovilizar', (s) => { s.freeze = { rows: 1, cols: 0 }; }, { rebuild: false }) },
    { label: 'Primera columna', checked: sheet.freeze.cols === 1 && sheet.freeze.rows === 0, onSelect: () => ctl.sheetOp('Inmovilizar', (s) => { s.freeze = { rows: 0, cols: 1 }; }, { rebuild: false }) },
    { label: `Hasta la celda actual (${cellName(sel.r, sel.c)})`, onSelect: () => ctl.sheetOp('Inmovilizar', (s) => { s.freeze = { rows: sel.r, cols: sel.c }; }, { rebuild: false }) },
  ];

  const doCopy = (cut: boolean, e?: ClipboardEvent) => {
    const payload = copyRange(ctl, sel.range, cut);
    if (e?.clipboardData) {
      e.clipboardData.setData('text/plain', payload.tsv);
      e.clipboardData.setData('text/html', toHtmlTable(ctl, sel.range));
      e.preventDefault();
    } else {
      void navigator.clipboard?.writeText(payload.tsv).catch(() => undefined);
    }
    if (cut) toast.info('Pega en la celda de destino para mover el contenido.');
  };

  const pasteFromSystem = async (valuesOnly = false) => {
    try {
      const text = await navigator.clipboard.readText();
      pasteAt(ctl, { r: sel.r, c: sel.c }, text, null, { valuesOnly });
    } catch {
      // Sin permiso de lectura: usar el portapapeles interno si existe
      pasteAt(ctl, { r: sel.r, c: sel.c }, null, null, { valuesOnly });
    }
  };

  // Portapapeles del sistema (Ctrl+C/X/V con la cuadrícula enfocada)
  useEffect(() => {
    const isGrid = () => document.activeElement === gridRef.current;
    const onCopy = (e: ClipboardEvent) => isGrid() && doCopy(false, e);
    const onCut = (e: ClipboardEvent) => isGrid() && doCopy(true, e);
    const onPaste = (e: ClipboardEvent) => {
      if (!isGrid()) return;
      e.preventDefault();
      pasteAt(ctl, { r: ctl.sel.r, c: ctl.sel.c }, e.clipboardData?.getData('text/plain') ?? '', e.clipboardData?.getData('text/html') || null);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  const doPrint = async () => {
    try {
      await printHtml(buildSheetPrintHtml(ctl, sheet, session.file.name), session.file.name);
    } catch (e) {
      reportError(e, 'No se pudo imprimir');
    }
  };

  const doExport = async (id: string) => {
    const opt = SHEETS_EXPORTS.find((x) => x.id === id)!;
    try {
      await session.flush();
      const { blob, warnings } = await opt.run(ctl.wb, session.file.name);
      downloadBlob(blob, `${session.file.name}${opt.perSheet ? ` - ${sheet.name}` : ''}.${opt.extension}`);
      if (warnings.length) void alertDialog({ title: 'Exportado con avisos', message: warnings.map((w) => `• ${w}`).join('\n') });
      else toast.success(`Descargado como ${opt.extension.toUpperCase()}.`);
    } catch (e) {
      reportError(e, 'No se pudo exportar');
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (edit) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const moveSel = (dr: number, dc: number) => {
      e.preventDefault();
      const fromR = e.shiftKey ? (sel.range.r1 === sel.r ? sel.range.r2 : sel.range.r1) : sel.r;
      const fromC = e.shiftKey ? (sel.range.c1 === sel.c ? sel.range.c2 : sel.range.c1) : sel.c;
      let target = { r: fromR + dr, c: fromC + dc };
      if (mod) target = ctl.jump(fromR, fromC, dr, dc);
      // Saltar celdas combinadas y filas ocultas
      const m = !e.shiftKey ? ctl.mergeAt(sel.r, sel.c) : undefined;
      if (m && !mod) {
        if (dr > 0) target.r = m.r2 + 1;
        if (dc > 0) target.c = m.c2 + 1;
      }
      if (e.shiftKey) ctl.selectRange({ r1: sel.r, c1: sel.c, r2: Math.max(0, target.r), c2: Math.max(0, target.c) }, { r: sel.r, c: sel.c });
      else ctl.select(target.r, target.c);
    };
    if (selectedChart && (k === 'Delete' || k === 'Backspace')) {
      e.preventDefault();
      ctl.sheetOp('Eliminar gráfico', (s) => { s.charts = s.charts.filter((c) => c.id !== selectedChart); }, { rebuild: false });
      setSelectedChart(null);
      return;
    }
    if (mod) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) return e.preventDefault(), ctl.undo();
      if (lk === 'y' || (lk === 'z' && e.shiftKey)) return e.preventDefault(), ctl.redo();
      if (lk === 'b') return e.preventDefault(), ctl.toggleStyle('bold');
      if (lk === 'i') return e.preventDefault(), ctl.toggleStyle('italic');
      if (lk === 'u') return e.preventDefault(), ctl.toggleStyle('underline');
      if (lk === 'a') return e.preventDefault(), ctl.selectRange({ r1: 0, c1: 0, r2: sheet.rowCount - 1, c2: sheet.colCount - 1 }, { r: sel.r, c: sel.c });
      if (lk === 'f') return e.preventDefault(), setPanel('find');
      if (lk === 'h') return e.preventDefault(), setPanel('replace');
      if (lk === 'p') return e.preventDefault(), void doPrint();
      if (lk === 's') return e.preventDefault(), void session.flush().then(() => toast.success('Guardado.'));
      if (lk === 'l' && e.shiftKey) return e.preventDefault(), toggleFilter();
      if (lk === 'd') {
        e.preventDefault();
        const r = sel.range;
        if (r.r2 > r.r1) fillRange(ctl, { ...r, r2: r.r1 }, r);
        return;
      }
      if (lk === 'r') {
        e.preventDefault();
        const r = sel.range;
        if (r.c2 > r.c1) fillRange(ctl, { ...r, c2: r.c1 }, r);
        return;
      }
      if (k === ';' || k === ',') {
        e.preventDefault();
        const now = new Date();
        if (e.shiftKey) setEdit({ r: sel.r, c: sel.c, value: formatValue(jsDateToSerial(now) % 1, 'hh:mm').text, mode: 'enter' });
        else setEdit({ r: sel.r, c: sel.c, value: formatValue(Math.floor(jsDateToSerial(now)), getLocale().dateOrder === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy').text, mode: 'enter' });
        return;
      }
      if (k === 'Home') return e.preventDefault(), ctl.select(0, 0);
      if (k === 'End') {
        e.preventDefault();
        let maxR = 0;
        let maxC = 0;
        for (const key of Object.keys(sheet.cells)) {
          const [r, c] = key.split(',').map(Number);
          maxR = Math.max(maxR, r);
          maxC = Math.max(maxC, c);
        }
        return ctl.select(maxR, maxC);
      }
    }
    if (e.altKey && (k === '=' || k === '0')) return e.preventDefault(), autoSum('SUM');
    switch (k) {
      case 'ArrowUp':
        return moveSel(-1, 0);
      case 'ArrowDown':
        return moveSel(1, 0);
      case 'ArrowLeft':
        return moveSel(0, -1);
      case 'ArrowRight':
        return moveSel(0, 1);
      case 'Tab':
        e.preventDefault();
        return ctl.select(sel.r, sel.c + (e.shiftKey ? -1 : 1));
      case 'Enter':
        e.preventDefault();
        return ctl.select(sel.r + (e.shiftKey ? -1 : 1), sel.c);
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        const step = Math.max(1, Math.floor((gridRef.current?.clientHeight ?? 600) / 24) - 2);
        return ctl.select(sel.r + (k === 'PageDown' ? step : -step), sel.c);
      }
      case 'Home':
        e.preventDefault();
        return ctl.select(sel.r, 0);
      case 'Delete':
        e.preventDefault();
        return ctl.clearRange(sel.range, 'contents');
      case 'Backspace':
        e.preventDefault();
        return startEdit('');
      case 'F2':
        e.preventDefault();
        return startEdit();
      case 'Escape':
        setSelectedChart(null);
        return;
      default:
        if (k.length === 1 && !mod && !e.altKey) {
          e.preventDefault();
          startEdit(k);
        }
    }
  };

  const cellMenu = (): MenuItem[] => {
    const r = sel.range;
    const nRows = r.r2 - r.r1 + 1;
    const nCols = r.c2 - r.c1 + 1;
    return [
      { label: 'Cortar', shortcut: 'Ctrl+X', onSelect: () => doCopy(true) },
      { label: 'Copiar', shortcut: 'Ctrl+C', onSelect: () => doCopy(false) },
      { label: 'Pegar', shortcut: 'Ctrl+V', onSelect: () => void pasteFromSystem() },
      { label: 'Pegar solo valores', onSelect: () => void pasteFromSystem(true) },
      { type: 'separator' },
      { label: `Insertar ${nRows} fila(s) encima`, onSelect: () => changeStructure(ctl, 'row', r.r1, nRows) },
      { label: `Insertar ${nRows} fila(s) debajo`, onSelect: () => changeStructure(ctl, 'row', r.r2 + 1, nRows) },
      { label: `Insertar ${nCols} columna(s) a la izquierda`, onSelect: () => changeStructure(ctl, 'col', r.c1, nCols) },
      { label: `Insertar ${nCols} columna(s) a la derecha`, onSelect: () => changeStructure(ctl, 'col', r.c2 + 1, nCols) },
      { label: 'Eliminar fila(s)', danger: true, onSelect: () => changeStructure(ctl, 'row', r.r1, -nRows) },
      { label: 'Eliminar columna(s)', danger: true, onSelect: () => changeStructure(ctl, 'col', r.c1, -nCols) },
      { type: 'separator' },
      { label: 'Borrar contenido', shortcut: 'Supr', onSelect: () => ctl.clearRange(r, 'contents') },
      { label: 'Borrar formato', onSelect: () => ctl.clearRange(r, 'formats') },
      { type: 'separator' },
      { label: 'Ordenar de A a Z', onSelect: () => sortSelection(true) },
      { label: 'Ordenar de Z a A', onSelect: () => sortSelection(false) },
      { label: sheet.filter ? 'Quitar filtro' : 'Crear filtro', onSelect: toggleFilter },
      { type: 'separator' },
      { label: merged ? 'Separar celdas' : 'Combinar celdas', onSelect: toggleMerge },
      { label: 'Formato condicional…', onSelect: () => setDialog('cf') },
      { label: 'Validación de datos…', onSelect: () => setDialog('dv') },
      { label: 'Insertar gráfico…', onSelect: () => { setEditingChart(null); setDialog('chart'); } },
    ];
  };

  const headerMenu = (hit: HeaderHit): MenuItem[] => {
    const r = sel.range;
    if (hit.kind === 'col') {
      const n = r.c2 - r.c1 + 1;
      return [
        { label: 'Cortar', onSelect: () => doCopy(true) },
        { label: 'Copiar', onSelect: () => doCopy(false) },
        { label: 'Pegar', onSelect: () => void pasteFromSystem() },
        { type: 'separator' },
        { label: `Insertar ${n} columna(s) a la izquierda`, onSelect: () => changeStructure(ctl, 'col', r.c1, n) },
        { label: `Insertar ${n} columna(s) a la derecha`, onSelect: () => changeStructure(ctl, 'col', r.c2 + 1, n) },
        { label: `Eliminar columna(s) ${colToLetters(r.c1)}${n > 1 ? `–${colToLetters(r.c2)}` : ''}`, danger: true, onSelect: () => changeStructure(ctl, 'col', r.c1, -n) },
        { label: 'Borrar columna(s)', onSelect: () => ctl.clearRange(r, 'all') },
        { type: 'separator' },
        { label: 'Cambiar ancho…', onSelect: async () => {
          const w = await promptDialog({ title: 'Ancho de columna', message: 'Ancho en píxeles', defaultValue: String(sheet.colWidths[hit.index] ?? DEFAULT_COL_WIDTH) });
          const n2 = Number(w);
          if (w && n2 > 0) ctl.sheetOp('Ancho de columna', (s) => { for (let c = r.c1; c <= r.c2; c++) s.colWidths[c] = Math.min(2000, n2); }, { rebuild: false });
        } },
        { label: 'Ajustar al contenido', onSelect: () => autoFit('col', hit.index) },
        { label: 'Ordenar la hoja de A a Z por esta columna', onSelect: () => sortRange(ctl, ctl.currentRegion(1, hit.index), [{ col: hit.index, asc: true }], typeof ctl.value(0, hit.index) === 'string') },
      ];
    }
    const n = r.r2 - r.r1 + 1;
    return [
      { label: 'Cortar', onSelect: () => doCopy(true) },
      { label: 'Copiar', onSelect: () => doCopy(false) },
      { label: 'Pegar', onSelect: () => void pasteFromSystem() },
      { type: 'separator' },
      { label: `Insertar ${n} fila(s) encima`, onSelect: () => changeStructure(ctl, 'row', r.r1, n) },
      { label: `Insertar ${n} fila(s) debajo`, onSelect: () => changeStructure(ctl, 'row', r.r2 + 1, n) },
      { label: `Eliminar fila(s) ${r.r1 + 1}${n > 1 ? `–${r.r2 + 1}` : ''}`, danger: true, onSelect: () => changeStructure(ctl, 'row', r.r1, -n) },
      { label: 'Borrar fila(s)', onSelect: () => ctl.clearRange(r, 'all') },
      { type: 'separator' },
      { label: 'Cambiar alto…', onSelect: async () => {
        const h = await promptDialog({ title: 'Alto de fila', message: 'Alto en píxeles', defaultValue: String(sheet.rowHeights[hit.index] ?? 24) });
        const n2 = Number(h);
        if (h && n2 > 0) ctl.sheetOp('Alto de fila', (s) => { for (let rr = r.r1; rr <= r.r2; rr++) s.rowHeights[rr] = Math.min(800, n2); }, { rebuild: false });
      } },
      { label: 'Alto predeterminado', onSelect: () => autoFit('row', hit.index) },
    ];
  };

  const fileItems = useCommonFileItems(() => setVersionsOpen(true));
  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: () => [
        ...fileItems.slice(0, 3),
        { type: 'separator' },
        { label: 'Descargar como', icon: Download, submenu: SHEETS_EXPORTS.map((x) => ({ label: x.label, onSelect: () => void doExport(x.id) })) },
        { label: 'Exportar hoja a PDF…', icon: FileText, onSelect: () => { toast.info('En el diálogo de impresión elige «Guardar como PDF».'); void doPrint(); } },
        { label: 'Imprimir…', icon: Printer, shortcut: 'Ctrl+P', onSelect: () => void doPrint() },
        ...fileItems.slice(3),
      ],
    },
    {
      label: 'Editar',
      items: () => [
        { label: ctl.undoLabel() ? `Deshacer: ${ctl.undoLabel()}` : 'Deshacer', shortcut: 'Ctrl+Z', disabled: !ctl.canUndo(), onSelect: () => ctl.undo() },
        { label: 'Rehacer', shortcut: 'Ctrl+Y', disabled: !ctl.canRedo(), onSelect: () => ctl.redo() },
        { type: 'separator' },
        { label: 'Cortar', shortcut: 'Ctrl+X', onSelect: () => doCopy(true) },
        { label: 'Copiar', shortcut: 'Ctrl+C', onSelect: () => doCopy(false) },
        { label: 'Pegar', shortcut: 'Ctrl+V', onSelect: () => void pasteFromSystem() },
        { label: 'Pegar solo valores', onSelect: () => void pasteFromSystem(true) },
        { type: 'separator' },
        { label: 'Rellenar hacia abajo', shortcut: 'Ctrl+D', onSelect: () => sel.range.r2 > sel.range.r1 && fillRange(ctl, { ...sel.range, r2: sel.range.r1 }, sel.range) },
        { label: 'Rellenar hacia la derecha', shortcut: 'Ctrl+R', onSelect: () => sel.range.c2 > sel.range.c1 && fillRange(ctl, { ...sel.range, c2: sel.range.c1 }, sel.range) },
        { label: 'Borrar contenido', shortcut: 'Supr', onSelect: () => ctl.clearRange(sel.range, 'contents') },
        { label: 'Borrar todo', onSelect: () => ctl.clearRange(sel.range, 'all') },
        { type: 'separator' },
        { label: 'Buscar…', shortcut: 'Ctrl+F', onSelect: () => setPanel('find') },
        { label: 'Buscar y reemplazar…', shortcut: 'Ctrl+H', onSelect: () => setPanel('replace') },
      ],
    },
    { label: 'Insertar', items: () => [
      { label: 'Filas encima', onSelect: () => changeStructure(ctl, 'row', sel.range.r1, sel.range.r2 - sel.range.r1 + 1) },
      { label: 'Filas debajo', onSelect: () => changeStructure(ctl, 'row', sel.range.r2 + 1, sel.range.r2 - sel.range.r1 + 1) },
      { label: 'Columnas a la izquierda', onSelect: () => changeStructure(ctl, 'col', sel.range.c1, sel.range.c2 - sel.range.c1 + 1) },
      { label: 'Columnas a la derecha', onSelect: () => changeStructure(ctl, 'col', sel.range.c2 + 1, sel.range.c2 - sel.range.c1 + 1) },
      { type: 'separator' },
      { label: 'Gráfico…', onSelect: () => { setEditingChart(null); setDialog('chart'); } },
      { label: 'Hoja nueva', onSelect: () => addSheet(ctl) },
      { type: 'separator' },
      { label: 'Fecha de hoy', shortcut: 'Ctrl+;', onSelect: () => ctl.setCellInput(sel.r, sel.c, formatValue(Math.floor(jsDateToSerial(new Date())), 'dd/mm/yyyy').text) },
      { label: 'Función SUMA', onSelect: () => autoSum('SUM') },
    ] },
    { label: 'Formato', items: () => [
      { label: 'Negrita', shortcut: 'Ctrl+B', checked: !!activeStyle.bold, onSelect: () => ctl.toggleStyle('bold') },
      { label: 'Cursiva', shortcut: 'Ctrl+I', checked: !!activeStyle.italic, onSelect: () => ctl.toggleStyle('italic') },
      { label: 'Subrayado', shortcut: 'Ctrl+U', checked: !!activeStyle.underline, onSelect: () => ctl.toggleStyle('underline') },
      { label: 'Ajustar texto', checked: !!activeStyle.wrap, onSelect: () => ctl.toggleStyle('wrap') },
      { type: 'separator' },
      { label: merged ? 'Separar celdas' : 'Combinar celdas', onSelect: toggleMerge },
      { label: 'Formato condicional…', onSelect: () => setDialog('cf') },
      { label: 'Formato numérico personalizado…', onSelect: async () => {
        const f = await promptDialog({ title: 'Formato personalizado', message: 'Código de formato (por ejemplo: #,##0.00 "€" · 0.0% · dd/mm/yyyy)', defaultValue: activeStyle.numFmt ?? 'General' });
        if (f !== null) ctl.applyStyle(sel.range, { numFmt: f === 'General' || f === '' ? undefined : f }, 'Formato numérico');
      } },
      { type: 'separator' },
      { label: sheet.gridlines === false ? 'Mostrar líneas de cuadrícula' : 'Ocultar líneas de cuadrícula', onSelect: () => ctl.sheetOp('Líneas de cuadrícula', (s) => { s.gridlines = s.gridlines === false; }, { rebuild: false }) },
      { label: 'Borrar formato', onSelect: () => ctl.clearRange(sel.range, 'formats') },
    ] },
    { label: 'Datos', items: () => [
      { label: 'Ordenar de A a Z', onSelect: () => sortSelection(true) },
      { label: 'Ordenar de Z a A', onSelect: () => sortSelection(false) },
      { label: sheet.filter ? 'Quitar filtro' : 'Crear filtro', shortcut: 'Ctrl+Mayús+L', onSelect: toggleFilter },
      { type: 'separator' },
      { label: 'Validación de datos…', onSelect: () => setDialog('dv') },
      { type: 'separator' },
      { label: 'Inmovilizar', submenu: freezeItems },
      { label: 'Recalcular ahora', onSelect: () => { ctl.engine.rebuild(); ctl.emit(false); toast.success('Libro recalculado.'); } },
    ] },
  ];

  // Barra de fórmulas
  const nameBox = edit ? cellName(edit.r, edit.c) : sel.range.r1 === sel.range.r2 && sel.range.c1 === sel.range.c2 ? cellName(sel.r, sel.c) : rangeName(sel.range);
  const formulaValue = edit ? edit.value : ctl.rawInput(sel.r, sel.c);
  const stats = ctl.selectionStats();
  const listRule = listMenu ? sheet.validations.find((v) => v.type === 'list' && listMenu.r >= v.range.r1 && listMenu.r <= v.range.r2 && listMenu.c >= v.range.c1 && listMenu.c <= v.range.c2) : undefined;
  void version;

  return (
    <EditorShell
      menus={menus}
      versionsOpen={versionsOpen}
      onVersionsClose={() => setVersionsOpen(false)}
      toolbar={
        <>
          <SheetsToolbar
            ctl={ctl}
            style={activeStyle}
            onPrint={() => void doPrint()}
            onChart={() => { setEditingChart(null); setDialog('chart'); }}
            onFind={() => setPanel('find')}
            onFilter={toggleFilter}
            onSort={sortSelection}
            onMerge={toggleMerge}
            onAutoSum={autoSum}
            freezeItems={freezeItems}
            hasFilter={!!sheet.filter}
            merged={merged}
          />
          <div className="formula-bar">
            <input
              className="name-box"
              aria-label="Cuadro de nombres: escribe una referencia y pulsa Intro"
              key={nameBox}
              defaultValue={nameBox}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const ref = parseRangeRef((e.target as HTMLInputElement).value);
                if (!ref) return toast.error('Referencia no válida.');
                if (ref.sheet) {
                  const idx = ctl.wb.sheets.findIndex((s) => s.name.toLowerCase() === ref.sheet!.toLowerCase());
                  if (idx < 0) return toast.error('La hoja no existe.');
                  ctl.setActiveSheet(idx);
                }
                ctl.selectRange(ref.range);
                focusGrid();
              }}
            />
            <span className="fx" aria-hidden="true">fx</span>
            <input
              className="formula-input"
              aria-label="Barra de fórmulas"
              value={formulaValue}
              onFocus={() => !edit && setEdit({ r: sel.r, c: sel.c, value: ctl.rawInput(sel.r, sel.c), mode: 'edit' })}
              onChange={(e) => setEdit({ r: edit?.r ?? sel.r, c: edit?.c ?? sel.c, value: e.target.value, mode: 'edit' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit({ dr: 1, dc: 0 });
                } else if (e.key === 'Escape') {
                  setEdit(null);
                  focusGrid();
                }
              }}
            />
          </div>
        </>
      }
    >
      <div className="sheets-main">
        <Grid
          ctl={ctl}
          version={version}
          edit={edit}
          setEdit={setEdit}
          commitEdit={commitEdit}
          onKey={onKey}
          onCellContextMenu={(x, y) => ctxMenu.openAt(cellMenu(), x, y, 'Acciones de celda')}
          onHeaderContextMenu={(hit, x, y) => ctxMenu.openAt(headerMenu(hit), x, y, hit.kind === 'col' ? 'Acciones de columna' : 'Acciones de fila')}
          onFill={(s, t) => fillRange(ctl, s, normalizeRange(t))}
          onFilterMenu={(col, anchor) => setFilterMenu({ col, anchor })}
          onListMenu={(r, c, anchor) => {
            const rect = anchor.getBoundingClientRect();
            setListMenu({ r, c, x: rect.left, y: rect.bottom + 2 });
          }}
          selectedChart={selectedChart}
          setSelectedChart={setSelectedChart}
          onEditChart={(c) => { setEditingChart(c); setDialog('chart'); }}
          gridRef={gridRef}
          editorRef={editorRef}
          autoFit={autoFit}
        />
        <div className="sheet-tabs" role="tablist" aria-label="Hojas">
          <button type="button" className="icon-btn" aria-label="Añadir hoja" title="Añadir hoja" onClick={() => addSheet(ctl)}><Plus size={16} /></button>
          {ctl.wb.sheets.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === ctl.wb.activeSheet}
              className={`sheet-tab ${i === ctl.wb.activeSheet ? 'is-active' : ''}`}
              style={s.tabColor ? { boxShadow: `inset 0 -3px 0 ${s.tabColor}` } : undefined}
              onClick={() => { if (edit) commitEdit(null); ctl.setActiveSheet(i); }}
              onDoubleClick={async () => {
                const name = await promptDialog({ title: 'Cambiar nombre de la hoja', defaultValue: s.name });
                if (name) { const err = renameSheet(ctl, i, name); if (err) toast.error(err); }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                ctl.setActiveSheet(i);
                ctxMenu.openAt([
                  { label: 'Cambiar nombre…', onSelect: async () => { const name = await promptDialog({ title: 'Cambiar nombre de la hoja', defaultValue: s.name }); if (name) { const err = renameSheet(ctl, i, name); if (err) toast.error(err); } } },
                  { label: 'Duplicar', onSelect: () => duplicateSheet(ctl, i) },
                  { label: 'Mover a la izquierda', disabled: i === 0, onSelect: () => moveSheet(ctl, i, i - 1) },
                  { label: 'Mover a la derecha', disabled: i === ctl.wb.sheets.length - 1, onSelect: () => moveSheet(ctl, i, i + 1) },
                  { label: 'Color de pestaña', submenu: [null, '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed'].map((c) => ({ label: c ? c : 'Sin color', onSelect: () => ctl.sheetOp('Color de pestaña', (sh) => { sh.tabColor = c; }, { rebuild: false }) })) },
                  { type: 'separator' },
                  { label: 'Eliminar hoja', danger: true, disabled: ctl.wb.sheets.length <= 1, onSelect: async () => {
                    if (await confirmDialog({ title: 'Eliminar hoja', message: `Se eliminará la hoja «${s.name}». Las fórmulas que la usan mostrarán #REF!. Puedes deshacerlo con Ctrl+Z.`, danger: true, confirmLabel: 'Eliminar' })) deleteSheet(ctl, i);
                  } },
                ], e.clientX, e.clientY, `Acciones de la hoja ${s.name}`);
              }}
            >
              {s.name}
            </button>
          ))}
          <div className="spacer" />
          {stats && (
            <span className="sel-stats" aria-live="polite">
              {stats.numeric > 0 && <>Suma: {formatValue(stats.sum, activeStyle.numFmt).text} · Promedio: {formatValue(stats.avg ?? 0, activeStyle.numFmt).text} · </>}
              Recuento: {stats.count}
            </span>
          )}
        </div>
      </div>
      {panel && <FindPanel ctl={ctl} version={version} focusReplace={panel === 'replace'} onClose={() => { setPanel(null); focusGrid(); }} />}
      {filterMenu && sheet.filter && <FilterPopover ctl={ctl} col={filterMenu.col} anchor={filterMenu.anchor} onClose={() => { setFilterMenu(null); focusGrid(); }} />}
      {listMenu && listRule &&
        createPortal(
          <MenuList
            label="Valores permitidos"
            anchor={{ x: listMenu.x, y: listMenu.y }}
            items={listOptions(listRule, ctl).map((o) => ({ label: o, onSelect: () => ctl.setCellInput(listMenu.r, listMenu.c, o) }))}
            onClose={() => { setListMenu(null); focusGrid(); }}
          />,
          document.body,
        )}
      {listMenu && <div className="click-catcher" onMouseDown={() => setListMenu(null)} />}
      {ctxMenu.element}
      <ConditionalFormatDialog open={dialog === 'cf'} onClose={() => { setDialog(null); focusGrid(); }} ctl={ctl} />
      <ValidationDialog open={dialog === 'dv'} onClose={() => { setDialog(null); focusGrid(); }} ctl={ctl} />
      <ChartDialog open={dialog === 'chart'} onClose={() => { setDialog(null); focusGrid(); }} ctl={ctl} chart={editingChart} />
    </EditorShell>
  );
}

