import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/react';
import { Download, FileText, Image as ImageIcon, Play, Printer } from 'lucide-react';
import type { EditorProps } from '@/app/types';
import { EditorShell, useCommonFileItems, type MenuDef } from '@/app/EditorShell';
import { blobToDataUrl, downloadBlob, pickFiles } from '@/core/files/download';
import { isSafeImageSrc } from '@/core/files/validate';
import { printHtml } from '@/core/files/print';
import { Button } from '@/ui/Button';
import { useMenu, type MenuItem } from '@/ui/Menu';
import { alertDialog, confirmDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import { newId, SLIDE_SIZES, textDoc, type Presentation, type ShapeKind, type SlideElement } from './model';
import { LAYOUTS, layoutElements } from './layouts';
import { THEMES } from './themes';
import { SlidesStore } from './store';
import { SLIDES_EXPORTS } from './formats';
import { buildSlidesPrintHtml } from './print';
import { scaleFontSizes } from './textOps';
import { SlideCanvas } from './ui/Canvas';
import { Thumbnails } from './ui/Thumbnails';
import { PropertiesPanel } from './ui/Properties';
import { Presenter } from './ui/Presenter';
import { SlidesToolbar } from './ui/Toolbar';
import './slides.css';

const MAX_IMAGE = 15 * 1024 * 1024;

export default function SlidesEditor({ session }: EditorProps<Presentation>) {
  const store = useMemo(() => new SlidesStore(session.initialContent), [session]);
  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  const [textEditor, setTextEditor] = useState<Editor | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [snapGrid, setSnapGrid] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [showProps, setShowProps] = useState(true);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const ctxMenu = useMenu();

  useEffect(() => {
    store.onChange = () => session.markDirty();
    session.setSerializer(() => store.serialize());
  }, [store, session]);

  const pres = store.pres;
  const slide = store.slide;
  const W = pres.size.width;
  const H = pres.size.height;

  const onTextEditor = useCallback((e: Editor | null) => setTextEditor(e), []);

  const centerBox = (w: number, h: number) => ({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, rotation: 0 });

  const insertText = () => {
    const el: SlideElement = { id: newId(), type: 'text', ...centerBox(400, 70), content: textDoc([{ text: 'Escribe aquí', size: 28, color: pres.theme.colors.text }]), style: { vAlign: 'top', padding: 8 } };
    store.addElement(el);
    store.editing = el.id;
    store.emit(false);
  };
  const insertShape = (shape: ShapeKind) =>
    store.addElement({ id: newId(), type: 'shape', shape, ...centerBox(200, shape === 'arrowRight' || shape === 'arrowLeft' || shape === 'chevron' ? 110 : 200), fill: pres.theme.colors.accent[0], stroke: null, strokeWidth: 0 });
  const insertLine = (arrow: boolean) => store.addElement({ id: newId(), type: 'line', ...centerBox(300, 0), h: 1, stroke: pres.theme.colors.text, strokeWidth: 3, arrowEnd: arrow });
  const insertTable = () =>
    store.addElement({
      id: newId(),
      type: 'table',
      ...centerBox(600, 200),
      rows: [[{ text: 'Encabezado 1' }, { text: 'Encabezado 2' }, { text: 'Encabezado 3' }], [{ text: '' }, { text: '' }, { text: '' }], [{ text: '' }, { text: '' }, { text: '' }]],
      colWidths: [1 / 3, 1 / 3, 1 / 3],
      fontSize: 18,
      headerRow: true,
      borderColor: '#9ca3af',
      headerFill: pres.theme.colors.accent[0],
    });

  const addImages = async (files: File[], at?: { x: number; y: number }) => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_IMAGE) {
        toast.error(`La imagen «${f.name}» supera los 15 MB.`);
        continue;
      }
      const src = await blobToDataUrl(f);
      if (!isSafeImageSrc(src)) continue;
      const img = new Image();
      img.src = src;
      await img.decode().catch(() => undefined);
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 3;
      let w = Math.min(img.naturalWidth || 480, W * 0.7);
      let h = w / ratio;
      if (h > H * 0.8) {
        h = H * 0.8;
        w = h * ratio;
      }
      const box = at ? { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w: Math.round(w), h: Math.round(h), rotation: 0 } : centerBox(Math.round(w), Math.round(h));
      store.addElement({ id: newId(), type: 'image', ...box, src, alt: f.name.replace(/\.[^.]+$/, ''), fit: 'contain' });
    }
  };

  const insertImage = async () => addImages(await pickFiles('image/png,image/jpeg,image/gif,image/webp,image/svg+xml', true));

  const doPrint = async (notes = false) => {
    try {
      await printHtml(buildSlidesPrintHtml(pres, session.file.name, { notes }), session.file.name);
    } catch (e) {
      reportError(e, 'No se pudo imprimir');
    }
  };

  const doExport = async (id: string) => {
    const opt = SLIDES_EXPORTS.find((x) => x.id === id)!;
    try {
      await session.flush();
      toast.info('Preparando la exportación…');
      const { blob, warnings } = await opt.run(pres, session.file.name);
      downloadBlob(blob, `${session.file.name}.${opt.extension}`);
      if (warnings.length) void alertDialog({ title: 'Exportado con avisos', message: warnings.map((w) => `• ${w}`).join('\n') });
    } catch (e) {
      reportError(e, 'No se pudo exportar');
    }
  };

  const exportCurrentPng = async () => {
    try {
      const { slideToPng } = await import('./exportImages');
      const bytes = await slideToPng(pres, slide);
      downloadBlob(new Blob([bytes as BlobPart], { type: 'image/png' }), `${session.file.name} - ${store.current + 1}.png`);
    } catch (e) {
      reportError(e, 'No se pudo exportar la imagen');
    }
  };

  const setSlideSize = (key: keyof typeof SLIDE_SIZES) => {
    const size = SLIDE_SIZES[key];
    if (size.width === W && size.height === H) return;
    const sy = size.height / H;
    const sx = size.width / W;
    store.mutate((p) => {
      p.size = { width: size.width, height: size.height };
      for (const s of p.slides)
        for (const e of s.elements) {
          e.x = Math.round(e.x * sx);
          e.y = Math.round(e.y * sy);
          e.w = Math.round(e.w * sx);
          e.h = Math.round(e.h * sy);
          if ((e.type === 'text' || e.type === 'shape') && e.content && Math.abs(sy - 1) > 0.3) e.content = scaleFontSizes(e.content, Math.min(sx, sy));
        }
    });
  };

  // Teclado del lienzo
  const onKey = (e: React.KeyboardEvent) => {
    if (store.editing) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const nudge = e.shiftKey ? 10 : 1;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    if (mod && k.toLowerCase() === 'z') return e.preventDefault(), e.shiftKey ? store.redo() : store.undo();
    if (mod && k.toLowerCase() === 'y') return e.preventDefault(), store.redo();
    if (mod && k.toLowerCase() === 'd') return e.preventDefault(), store.duplicateSelected();
    if (mod && k.toLowerCase() === 'c') return e.preventDefault(), store.copySelected();
    if (mod && k.toLowerCase() === 'x') return e.preventDefault(), store.copySelected(), store.deleteSelected();
    if (mod && k.toLowerCase() === 'v' && store.clipboard.length) return e.preventDefault(), store.paste();
    if (mod && k.toLowerCase() === 'a') return e.preventDefault(), store.select(slide.elements.map((x) => x.id));
    if (mod && k.toLowerCase() === 'm') return e.preventDefault(), store.addSlide('titleContent');
    if (mod && k.toLowerCase() === 's') return e.preventDefault(), void session.flush().then(() => toast.success('Guardado.'));
    if (k === 'F5') return e.preventDefault(), setPresenting(e.shiftKey ? store.current : 0);
    if (!store.selected.length) {
      if (k === 'PageDown' || k === 'ArrowDown' || k === 'ArrowRight') return e.preventDefault(), store.goTo(store.current + 1);
      if (k === 'PageUp' || k === 'ArrowUp' || k === 'ArrowLeft') return e.preventDefault(), store.goTo(store.current - 1);
      if (k === 'Tab' && slide.elements.length) return e.preventDefault(), store.select([slide.elements[0].id]);
      return;
    }
    switch (k) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return store.deleteSelected();
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const dx = k === 'ArrowLeft' ? -nudge : k === 'ArrowRight' ? nudge : 0;
        const dy = k === 'ArrowUp' ? -nudge : k === 'ArrowDown' ? nudge : 0;
        return store.updateElements(store.selected, (el) => {
          el.x += dx;
          el.y += dy;
        });
      }
      case 'Escape':
        return store.select([]);
      case 'Enter':
      case 'F2': {
        const el = store.selection[0];
        if (el && (el.type === 'text' || el.type === 'shape')) {
          e.preventDefault();
          store.checkpoint();
          store.editing = el.id;
          store.emit(false);
        }
        return;
      }
      case 'Tab': {
        e.preventDefault();
        const idx = slide.elements.findIndex((x) => x.id === store.selected[0]);
        const n = slide.elements.length;
        return store.select([slide.elements[(idx + (e.shiftKey ? -1 : 1) + n) % n].id]);
      }
    }
  };

  // Pegar imágenes del portapapeles
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (store.editing || (document.activeElement && document.activeElement.closest('input, textarea, [contenteditable="true"]'))) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void addImages(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const slideMenu = (i: number): MenuItem[] => [
    { label: 'Nueva diapositiva', submenu: LAYOUTS.map((l) => ({ label: l.label, onSelect: () => store.addSlide(l.id, i + 1) })) },
    { label: 'Duplicar', shortcut: 'Ctrl+D', onSelect: () => store.duplicateSlide(i) },
    { label: pres.slides[i]?.hidden ? 'Mostrar en la presentación' : 'Ocultar en la presentación', onSelect: () => store.mutate((p) => (p.slides[i].hidden = !p.slides[i].hidden)) },
    { label: 'Mover arriba', disabled: i === 0, onSelect: () => store.moveSlide(i, i - 1) },
    { label: 'Mover abajo', disabled: i === pres.slides.length - 1, onSelect: () => store.moveSlide(i, i + 1) },
    {
      label: 'Aplicar diseño',
      submenu: LAYOUTS.map((l) => ({
        label: l.label,
        onSelect: async () => {
          if (pres.slides[i].elements.length && !(await confirmDialog({ title: 'Aplicar diseño', message: 'Se sustituirán los elementos de la diapositiva por los del diseño. Puedes deshacerlo con Ctrl+Z.', confirmLabel: 'Aplicar' }))) return;
          store.mutate((p) => {
            p.slides[i].layout = l.id;
            p.slides[i].elements = layoutElements(l.id, p.theme, p.size);
          });
        },
      })),
    },
    { type: 'separator' },
    { label: 'Eliminar diapositiva', danger: true, disabled: pres.slides.length <= 1, onSelect: () => store.deleteSlide(i) },
  ];

  const canvasMenu = (): MenuItem[] => {
    const has = store.selected.length > 0;
    return [
      { label: 'Cortar', shortcut: 'Ctrl+X', disabled: !has, onSelect: () => { store.copySelected(); store.deleteSelected(); } },
      { label: 'Copiar', shortcut: 'Ctrl+C', disabled: !has, onSelect: () => store.copySelected() },
      { label: 'Pegar', shortcut: 'Ctrl+V', disabled: !store.clipboard.length, onSelect: () => store.paste() },
      { label: 'Duplicar', shortcut: 'Ctrl+D', disabled: !has, onSelect: () => store.duplicateSelected() },
      { type: 'separator' },
      { label: 'Traer al frente', disabled: !has, onSelect: () => store.reorder('front') },
      { label: 'Enviar al fondo', disabled: !has, onSelect: () => store.reorder('back') },
      { type: 'separator' },
      { label: 'Eliminar', danger: true, disabled: !has, onSelect: () => store.deleteSelected() },
    ];
  };

  const fileItems = useCommonFileItems(() => setVersionsOpen(true));
  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: () => [
        ...fileItems.slice(0, 3),
        { type: 'separator' },
        { label: 'Descargar como', icon: Download, submenu: SLIDES_EXPORTS.map((x) => ({ label: x.label, onSelect: () => void doExport(x.id) })) },
        { label: 'Diapositiva actual como imagen PNG', icon: ImageIcon, onSelect: () => void exportCurrentPng() },
        { label: 'Exportar a PDF…', icon: FileText, onSelect: () => { toast.info('En el diálogo de impresión elige «Guardar como PDF».'); void doPrint(); } },
        { label: 'Imprimir con notas…', icon: Printer, onSelect: () => void doPrint(true) },
        { label: 'Tamaño de diapositiva', submenu: (Object.keys(SLIDE_SIZES) as (keyof typeof SLIDE_SIZES)[]).map((k) => ({ label: SLIDE_SIZES[k].label, checked: SLIDE_SIZES[k].width === W && SLIDE_SIZES[k].height === H, onSelect: () => setSlideSize(k) })) },
        ...fileItems.slice(3),
      ],
    },
    {
      label: 'Editar',
      items: () => [
        { label: 'Deshacer', shortcut: 'Ctrl+Z', disabled: !store.canUndo(), onSelect: () => store.undo() },
        { label: 'Rehacer', shortcut: 'Ctrl+Y', disabled: !store.canRedo(), onSelect: () => store.redo() },
        { type: 'separator' },
        ...canvasMenu(),
        { type: 'separator' },
        { label: 'Seleccionar todo', shortcut: 'Ctrl+A', onSelect: () => store.select(slide.elements.map((x) => x.id)) },
      ],
    },
    {
      label: 'Insertar',
      items: () => [
        { label: 'Nueva diapositiva', shortcut: 'Ctrl+M', submenu: LAYOUTS.map((l) => ({ label: l.label, onSelect: () => store.addSlide(l.id) })) },
        { label: 'Duplicar diapositiva', onSelect: () => store.duplicateSlide() },
        { type: 'separator' },
        { label: 'Cuadro de texto', onSelect: insertText },
        { label: 'Imagen…', onSelect: () => void insertImage() },
        { label: 'Tabla', onSelect: insertTable },
        { label: 'Línea', onSelect: () => insertLine(false) },
        { label: 'Flecha', onSelect: () => insertLine(true) },
      ],
    },
    {
      label: 'Diseño',
      items: () => [
        { label: 'Tema', submenu: THEMES.map((t) => ({ label: t.name, checked: pres.theme.id === t.id, onSelect: () => store.setTheme(t, { recolor: true }) })) },
        { type: 'separator' },
        { label: 'Mostrar cuadrícula', checked: showGrid, onSelect: () => setShowGrid((v) => !v) },
        { label: 'Ajustar a la cuadrícula', checked: snapGrid, onSelect: () => setSnapGrid((v) => !v) },
        { label: 'Panel de propiedades', checked: showProps, onSelect: () => setShowProps((v) => !v) },
        { type: 'separator' },
        { label: 'Ajustar a la ventana', checked: zoom === 'fit', onSelect: () => setZoom('fit') },
        ...[0.5, 0.75, 1, 1.5].map((z) => ({ label: `Zoom ${z * 100}%`, checked: zoom === z, onSelect: () => setZoom(z) })),
      ],
    },
    {
      label: 'Presentación',
      items: () => [
        { label: 'Desde el principio', shortcut: 'F5', onSelect: () => setPresenting(0) },
        { label: 'Desde la diapositiva actual', shortcut: 'Mayús+F5', onSelect: () => setPresenting(store.current) },
      ],
    },
  ];

  void version;

  return (
    <EditorShell
      menus={menus}
      versionsOpen={versionsOpen}
      onVersionsClose={() => setVersionsOpen(false)}
      actions={
        <Button variant="primary" icon={Play} onClick={() => setPresenting(store.current)} title="Presentar desde la diapositiva actual (Mayús+F5)">
          <span className="hide-mobile">Presentar</span>
        </Button>
      }
      toolbar={
        <SlidesToolbar
          store={store}
          editor={textEditor && store.editing ? textEditor : null}
          onInsertText={insertText}
          onInsertShape={insertShape}
          onInsertLine={insertLine}
          onInsertImage={() => void insertImage()}
          onInsertTable={insertTable}
        />
      }
    >
      <Thumbnails store={store} version={version} onContextMenu={(i, x, y) => ctxMenu.openAt(slideMenu(i), x, y, `Diapositiva ${i + 1}`)} />
      <div className="slides-center">
        <div
          ref={canvasRef}
          className="canvas-focus"
          tabIndex={0}
          role="application"
          aria-label={`Diapositiva ${store.current + 1} de ${pres.slides.length}. Usa las flechas para mover el elemento seleccionado, Intro para editar el texto y Tab para cambiar de elemento.`}
          onKeyDown={onKey}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
            if (!files.length) return;
            e.preventDefault();
            e.stopPropagation();
            const stage = (e.currentTarget.querySelector('.stage') as HTMLElement).getBoundingClientRect();
            const scale = stage.width / W;
            void addImages(files, { x: (e.clientX - stage.left) / scale, y: (e.clientY - stage.top) / scale });
          }}
        >
          <SlideCanvas
            store={store}
            version={version}
            zoom={zoom}
            snapGrid={snapGrid}
            showGrid={showGrid}
            onTextEditor={onTextEditor}
            onContextMenu={(x, y) => ctxMenu.openAt(canvasMenu(), x, y, 'Acciones')}
            canvasRef={canvasRef}
          />
        </div>
        <label className="notes-area">
          <span className="sr-only">Notas del orador</span>
          <textarea
            placeholder="Haz clic para añadir notas del orador"
            value={slide.notes}
            onFocus={() => store.checkpoint()}
            onChange={(e) => {
              slide.notes = e.target.value;
              store.emit();
            }}
          />
        </label>
      </div>
      {showProps && <PropertiesPanel store={store} version={version} />}
      {ctxMenu.element}
      {presenting !== null && (
        <Presenter
          pres={pres}
          start={presenting}
          onExit={(last) => {
            setPresenting(null);
            store.goTo(last);
            requestAnimationFrame(() => canvasRef.current?.focus());
          }}
        />
      )}
    </EditorShell>
  );
}
