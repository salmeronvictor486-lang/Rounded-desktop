import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ArrowDown,
  ArrowUp,
  Download,
  FilePlus2,
  Highlighter,
  MousePointer2,
  Printer,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Square,
  StickyNote,
  Strikethrough,
  Trash2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { EditorProps } from '@/app/types';
import { EditorShell, useCommonFileItems, type MenuDef } from '@/app/EditorShell';
import { createNewFileFromBytes } from './newFile';
import { downloadBlob, pickFiles } from '@/core/files/download';
import { readFileBytes } from '@/core/files/validate';
import { detectContainer } from '@/core/files/signature';
import { printHtml } from '@/core/files/print';
import { Button, IconButton } from '@/ui/Button';
import { ColorPickerButton } from '@/ui/ColorPicker';
import { MenuButton } from '@/ui/Menu';
import { alertDialog, confirmDialog, promptDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import { createId } from '@/core/util/id';
import { normalizeFolio, type Annotation, type FolioContent } from './model';
import { deletePages, extractPages, flattenAnnotations, insertPdf, reorderPages, rotatePages } from './ops';
import { openPdf } from './pdfjs';
import { PageView, type Tool } from './PageView';
import 'pdfjs-dist/web/pdf_viewer.css';
import './pdf.css';

function Thumb({ pdf, index, selected, current, onClick, onDragStart, onDrop }: { pdf: PDFDocumentProxy; index: number; selected: boolean; current: boolean; onClick: (e: React.MouseEvent) => void; onDragStart: () => void; onDrop: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setVisible(true)), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    void pdf.getPage(index + 1).catch(() => null).then((page) => {
      if (!page) return;
      const vp = page.getViewport({ scale: 1 });
      const s = 140 / vp.width;
      const v = page.getViewport({ scale: s });
      const c = ref.current;
      if (!c) return;
      c.width = v.width;
      c.height = v.height;
      task = page.render({ canvas: c, viewport: v });
      task.promise.catch(() => undefined);
    });
    return () => task?.cancel();
  }, [visible, pdf, index]);
  return (
    <li>
      <button
        type="button"
        className={`pdf-thumb ${selected ? 'is-selected' : ''} ${current ? 'is-current' : ''} ${over ? 'drop-before' : ''}`}
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDrop();
        }}
        aria-label={`Página ${index + 1}`}
        aria-pressed={selected}
      >
        <canvas ref={ref} width={140} height={180} />
        <span className="pdf-thumb-num">{index + 1}</span>
      </button>
    </li>
  );
}

export default function PdfEditor({ session }: EditorProps<FolioContent>) {
  const [content, setContent] = useState<FolioContent>(() => normalizeFolio(session.initialContent));
  const contentRef = useRef(content);
  contentRef.current = content;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | 'width'>('width');
  const [scrollW, setScrollW] = useState(900);
  const [baseWidth, setBaseWidth] = useState(612);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#facc15');
  const [selectedAnn, setSelectedAnn] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ page: number; snippet: string }[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const undo = useRef<FolioContent[]>([]);
  const dragFrom = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    session.setSerializer(() => contentRef.current);
  }, [session]);

  // Cargar (o recargar) el documento cuando cambian los bytes
  useEffect(() => {
    if (!content.bytes.length) return;
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setLoadError(null);
    openPdf(content.bytes, async (retry) => promptDialog({ title: 'PDF protegido', message: retry ? 'Contraseña incorrecta. Inténtalo de nuevo:' : 'Este PDF tiene contraseña. Introdúcela para abrirlo:' }))
      .then(async (d) => {
        if (cancelled) return void d.loadingTask.destroy();
        doc = d;
        const first = await d.getPage(1);
        setBaseWidth(first.getViewport({ scale: 1 }).width);
        // Asignar identificadores a páginas nuevas o PDF importados sin ellos
        if (contentRef.current.pageIds.length !== d.numPages) {
          const ids = Array.from({ length: d.numPages }, (_, i) => contentRef.current.pageIds[i] ?? createId('p'));
          setContent((c) => ({ ...c, pageIds: ids }));
        }
        setPdf(d);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      // Primero se desmontan las páginas que usan el documento anterior; después se libera.
      setPdf(null);
      const old = doc;
      setTimeout(() => void old?.loadingTask.destroy(), 0);
    };
  }, [content.bytes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScrollW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf]);

  const scale = zoom === 'width' ? Math.max(0.3, Math.min(3, (scrollW - 64) / baseWidth)) : zoom;
  const numPages = pdf?.numPages ?? 0;

  // Página actual según el desplazamiento
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pdf) return;
    const on = () => {
      const pages = Array.from(el.querySelectorAll<HTMLElement>('.pdf-page'));
      const mid = el.scrollTop + el.clientHeight / 3;
      let cur = 0;
      for (const p of pages) if (p.offsetTop <= mid) cur = Number(p.dataset.page) - 1;
      setCurrent(cur);
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [pdf]);

  const goTo = (i: number) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${i + 1}"]`);
    el?.scrollIntoView({ block: 'start' });
    setCurrent(i);
  };

  /** Aplica un cambio guardando el estado anterior para deshacer. */
  const commit = useCallback(
    (next: FolioContent) => {
      undo.current.push(contentRef.current);
      if (undo.current.length > 15) undo.current.shift();
      setContent(next);
      contentRef.current = next;
      session.markDirty();
    },
    [session],
  );

  const run = async (label: string, fn: (c: FolioContent) => Promise<FolioContent>) => {
    setBusy(true);
    try {
      commit(await fn(contentRef.current));
      toast.success(label);
    } catch (e) {
      reportError(e, 'No se pudo completar la operación');
    } finally {
      setBusy(false);
    }
  };

  const targetPages = () => (selected.size ? Array.from(selected).sort((a, b) => a - b) : [current]);

  const addAnnotation = (a: Annotation) => commit({ ...contentRef.current, annotations: [...contentRef.current.annotations, a] });
  const updateAnnotation = (id: string, patch: Partial<Annotation>) => commit({ ...contentRef.current, annotations: contentRef.current.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const deleteAnnotation = (id: string) => {
    commit({ ...contentRef.current, annotations: contentRef.current.annotations.filter((a) => a.id !== id) });
    setSelectedAnn(null);
  };

  const download = async (withAnnotations: boolean) => {
    try {
      const bytes = withAnnotations ? await flattenAnnotations(contentRef.current) : contentRef.current.bytes;
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${session.file.name}.pdf`);
    } catch (e) {
      reportError(e, 'No se pudo descargar');
    }
  };

  const insertFile = async () => {
    const [f] = await pickFiles('.pdf,application/pdf');
    if (!f) return;
    try {
      const bytes = await readFileBytes(f);
      if (detectContainer(bytes) !== 'pdf') throw new Error('El archivo no es un PDF.');
      await run(`«${f.name}» insertado.`, (c) => insertPdf(c, bytes, current));
    } catch (e) {
      reportError(e);
    }
  };

  const extract = async () => {
    const pages = targetPages();
    try {
      const bytes = await extractPages(contentRef.current, pages);
      const choice = await confirmDialog({ title: 'Extraer páginas', message: `Se creará un PDF nuevo con ${pages.length} página(s). ¿Guardarlo en Mis archivos? (Cancelar = solo descargar)`, confirmLabel: 'Guardar en Mis archivos' });
      if (choice) await createNewFileFromBytes(bytes, `${session.file.name} (págs. ${pages.map((p) => p + 1).join(', ')})`);
      else downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${session.file.name} - extracto.pdf`);
    } catch (e) {
      reportError(e, 'No se pudieron extraer las páginas');
    }
  };

  const doSearch = async (q: string) => {
    setQuery(q);
    if (!pdf || !q.trim()) return setResults(null);
    const needle = q.trim().toLowerCase();
    const out: { page: number; snippet: string }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ');
      const low = text.toLowerCase();
      let idx = low.indexOf(needle);
      while (idx >= 0 && out.length < 500) {
        out.push({ page: i - 1, snippet: text.slice(Math.max(0, idx - 30), idx + needle.length + 30) });
        idx = low.indexOf(needle, idx + needle.length);
      }
    }
    setResults(out);
  };

  const print = async () => {
    if (!pdf) return;
    setBusy(true);
    toast.info('Preparando la impresión…');
    try {
      const bytes = await flattenAnnotations(contentRef.current);
      const doc = await openPdf(bytes);
      const imgs: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement('canvas');
        c.width = vp.width;
        c.height = vp.height;
        await page.render({ canvas: c, viewport: vp }).promise;
        imgs.push(`<img src="${c.toDataURL('image/jpeg', 0.92)}">`);
      }
      void doc.loadingTask.destroy();
      await printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}body{margin:0}img{width:100%;display:block;break-after:page}</style></head><body>${imgs.join('')}</body></html>`, session.file.name);
    } catch (e) {
      reportError(e, 'No se pudo imprimir');
    } finally {
      setBusy(false);
    }
  };

  // Teclado: borrar anotación, deshacer
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnn) {
        e.preventDefault();
        deleteAnnotation(selectedAnn);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const prev = undo.current.pop();
        if (prev) {
          e.preventDefault();
          setContent(prev);
          session.markDirty();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === 'Escape') {
        setTool('select');
        setSelectedAnn(null);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const fileItems = useCommonFileItems(() => setVersionsOpen(true));
  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: () => [
        ...fileItems.slice(0, 3),
        { type: 'separator' },
        { label: 'Descargar PDF (con anotaciones)', icon: Download, onSelect: () => void download(true) },
        { label: 'Descargar PDF original (sin anotaciones)', onSelect: () => void download(false) },
        { label: 'Imprimir…', icon: Printer, onSelect: () => void print() },
        ...fileItems.slice(3),
      ],
    },
    {
      label: 'Páginas',
      items: () => [
        { label: 'Girar a la derecha', icon: RotateCw, onSelect: () => void run('Página(s) girada(s).', (c) => rotatePages(c, targetPages(), 90)) },
        { label: 'Girar a la izquierda', icon: RotateCcw, onSelect: () => void run('Página(s) girada(s).', (c) => rotatePages(c, targetPages(), -90)) },
        { label: 'Mover arriba', disabled: targetPages()[0] === 0, onSelect: () => movePages(-1) },
        { label: 'Mover abajo', disabled: targetPages().at(-1) === numPages - 1, onSelect: () => movePages(1) },
        { type: 'separator' },
        { label: 'Insertar PDF después de la página actual…', icon: FilePlus2, onSelect: () => void insertFile() },
        { label: 'Extraer páginas seleccionadas (dividir)…', icon: Scissors, onSelect: () => void extract() },
        { label: 'Seleccionar todas', onSelect: () => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i))) },
        { type: 'separator' },
        { label: 'Eliminar páginas…', icon: Trash2, danger: true, onSelect: () => void removePages() },
      ],
    },
    {
      label: 'Ver',
      items: () => [
        { label: 'Ajustar al ancho', checked: zoom === 'width', onSelect: () => setZoom('width') },
        ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => ({ label: `${z * 100}%`, checked: zoom === z, onSelect: () => setZoom(z) })),
        { type: 'separator' },
        { label: 'Buscar texto', shortcut: 'Ctrl+F', onSelect: () => setShowSearch(true) },
      ],
    },
  ];

  const removePages = async () => {
    const pages = targetPages();
    const ok = await confirmDialog({ title: 'Eliminar páginas', message: `Se eliminarán ${pages.length} página(s): ${pages.map((p) => p + 1).join(', ')}. Puedes deshacerlo con Ctrl+Z mientras el documento esté abierto.`, danger: true, confirmLabel: 'Eliminar' });
    if (ok) {
      await run('Página(s) eliminada(s).', (c) => deletePages(c, pages));
      setSelected(new Set());
    }
  };

  const movePages = (dir: -1 | 1) => {
    const pages = targetPages();
    const order = Array.from({ length: numPages }, (_, i) => i);
    if (dir < 0) {
      for (const p of pages) if (p > 0 && !pages.includes(p - 1)) [order[p - 1], order[p]] = [order[p], order[p - 1]];
    } else {
      for (const p of [...pages].reverse()) if (p < numPages - 1 && !pages.includes(p + 1)) [order[p + 1], order[p]] = [order[p], order[p + 1]];
    }
    void run('Página(s) movida(s).', (c) => reorderPages(c, order));
    setSelected(new Set(pages.map((p) => p + dir)));
  };

  const annsByPage = useMemo(() => {
    const m = new Map<string, Annotation[]>();
    for (const a of content.annotations) m.set(a.pageId, [...(m.get(a.pageId) ?? []), a]);
    return m;
  }, [content.annotations]);

  const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
    { id: 'select', label: 'Seleccionar texto y anotaciones', icon: MousePointer2 },
    { id: 'highlight', label: 'Resaltar', icon: Highlighter },
    { id: 'strike', label: 'Tachar', icon: Strikethrough },
    { id: 'rect', label: 'Recuadro', icon: Square },
    { id: 'note', label: 'Nota', icon: StickyNote },
    { id: 'text', label: 'Texto libre', icon: Type },
  ];

  if (!content.bytes.length) {
    return (
      <EditorShell menus={menus} versionsOpen={versionsOpen} onVersionsClose={() => setVersionsOpen(false)}>
        <div className="center-fill">
          <p className="muted">Este archivo no contiene ningún PDF.</p>
          <Button icon={Upload} variant="primary" onClick={async () => {
            const [f] = await pickFiles('.pdf');
            if (!f) return;
            const bytes = await readFileBytes(f);
            if (detectContainer(bytes) !== 'pdf') return toast.error('El archivo no es un PDF.');
            commit({ ...contentRef.current, bytes, pageIds: [] });
          }}>Abrir un PDF</Button>
        </div>
      </EditorShell>
    );
  }

  return (
    <EditorShell
      menus={menus}
      versionsOpen={versionsOpen}
      onVersionsClose={() => setVersionsOpen(false)}
      actions={<Button variant="primary" icon={Download} onClick={() => void download(true)}><span className="hide-mobile">Descargar</span></Button>}
      toolbar={
        <div className="toolbar" role="toolbar" aria-label="Herramientas PDF">
          <div className="toolbar-group">
            <IconButton icon={ZoomOut} label="Alejar" onClick={() => setZoom(Math.max(0.25, Math.round((scale - 0.25) * 4) / 4))} />
            <MenuButton className="btn btn-sm" label="Zoom" items={[{ label: 'Ajustar al ancho', onSelect: () => setZoom('width') }, ...[0.5, 0.75, 1, 1.5, 2].map((z) => ({ label: `${z * 100}%`, onSelect: () => setZoom(z) }))]}>
              {Math.round(scale * 100)}%
            </MenuButton>
            <IconButton icon={ZoomIn} label="Acercar" onClick={() => setZoom(Math.min(4, Math.round((scale + 0.25) * 4) / 4))} />
          </div>
          <div className="toolbar-sep" />
          <label className="row" style={{ gap: 4 }}>
            <span className="sr-only">Página</span>
            <input className="input input-sm" style={{ width: 52, textAlign: 'center' }} key={current} defaultValue={current + 1} aria-label="Ir a la página"
              onKeyDown={(e) => { if (e.key === 'Enter') { const n = Number((e.target as HTMLInputElement).value); if (n >= 1 && n <= numPages) goTo(n - 1); } }} />
            <span className="muted">/ {numPages}</span>
          </label>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <IconButton icon={RotateCcw} label="Girar a la izquierda" disabled={busy} onClick={() => void run('Página(s) girada(s).', (c) => rotatePages(c, targetPages(), -90))} />
            <IconButton icon={RotateCw} label="Girar a la derecha" disabled={busy} onClick={() => void run('Página(s) girada(s).', (c) => rotatePages(c, targetPages(), 90))} />
            <IconButton icon={ArrowUp} label="Mover página arriba" disabled={busy} onClick={() => movePages(-1)} />
            <IconButton icon={ArrowDown} label="Mover página abajo" disabled={busy} onClick={() => movePages(1)} />
            <IconButton icon={Trash2} label="Eliminar página(s)" disabled={busy} onClick={() => void removePages()} />
            <IconButton icon={FilePlus2} label="Insertar otro PDF (combinar)" disabled={busy} onClick={() => void insertFile()} />
            <IconButton icon={Scissors} label="Extraer páginas (dividir)" disabled={busy} onClick={() => void extract()} />
          </div>
          <div className="toolbar-sep" />
          <div className="toolbar-group" role="radiogroup" aria-label="Herramienta de anotación">
            {tools.map((t) => (
              <IconButton key={t.id} icon={t.icon} label={t.label} active={tool === t.id} role="radio" aria-checked={tool === t.id} onClick={() => setTool(t.id)} />
            ))}
            <ColorPickerButton label="Color de anotación" value={color} onChange={(c) => c && setColor(c)}>
              <span className="swatch-dot" style={{ background: color }} />
            </ColorPickerButton>
          </div>
          <div className="toolbar-sep" />
          <IconButton icon={Search} label="Buscar (Ctrl+F)" active={showSearch} onClick={() => setShowSearch((v) => !v)} />
          <IconButton icon={Printer} label="Imprimir" onClick={() => void print()} />
        </div>
      }
    >
      {pdf ? (
        <>
          <nav className="pdf-thumbs" aria-label="Páginas">
            <ol>
              {Array.from({ length: numPages }, (_, i) => (
                <Thumb
                  key={`${content.pageIds[i] ?? i}-${content.bytes.length}`}
                  pdf={pdf}
                  index={i}
                  current={i === current}
                  selected={selected.has(i)}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      const n = new Set(selected);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      setSelected(n);
                    } else if (e.shiftKey) {
                      const a = Math.min(current, i);
                      const b = Math.max(current, i);
                      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k)));
                    } else {
                      setSelected(new Set());
                      goTo(i);
                    }
                  }}
                  onDragStart={() => (dragFrom.current = i)}
                  onDrop={() => {
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    if (from === null || from === i) return;
                    const order = Array.from({ length: numPages }, (_, k) => k);
                    order.splice(i, 0, order.splice(from, 1)[0]);
                    void run('Página movida.', (c) => reorderPages(c, order));
                  }}
                />
              ))}
            </ol>
          </nav>
          <div ref={scrollRef} className="pdf-scroll" onMouseDown={() => setSelectedAnn(null)}>
            {Array.from({ length: numPages }, (_, i) => (
              <PageView
                key={`${content.pageIds[i] ?? i}-${content.bytes.length}`}
                pdf={pdf}
                index={i}
                pageId={content.pageIds[i] ?? String(i)}
                scale={scale}
                annotations={annsByPage.get(content.pageIds[i] ?? '') ?? []}
                tool={tool}
                color={color}
                query={query}
                selectedAnn={selectedAnn}
                onSelectAnn={setSelectedAnn}
                onAdd={addAnnotation}
                onUpdate={updateAnnotation}
                estimate={{ w: baseWidth * scale, h: baseWidth * scale * 1.3 }}
              />
            ))}
          </div>
          {(showSearch || content.annotations.length > 0) && (
            <aside className="side-panel" aria-label="Búsqueda y anotaciones">
              {showSearch && (
                <section>
                  <h3>Buscar</h3>
                  <input className="input" autoFocus placeholder="Texto a buscar…" aria-label="Buscar en el PDF" onKeyDown={(e) => e.key === 'Enter' && void doSearch((e.target as HTMLInputElement).value)} onChange={(e) => !e.target.value && void doSearch('')} />
                  {results && <p className="muted" aria-live="polite">{results.length} resultado(s)</p>}
                  <ul className="pdf-results">
                    {results?.slice(0, 200).map((r, i) => (
                      <li key={i}><button type="button" onClick={() => goTo(r.page)}><strong>Pág. {r.page + 1}</strong> …{r.snippet}…</button></li>
                    ))}
                  </ul>
                </section>
              )}
              {content.annotations.length > 0 && (
                <section>
                  <h3>Anotaciones ({content.annotations.length})</h3>
                  <ul className="pdf-results">
                    {content.annotations.map((a) => {
                      const page = content.pageIds.indexOf(a.pageId);
                      return (
                        <li key={a.id} className={selectedAnn === a.id ? 'is-selected' : ''}>
                          <button type="button" onClick={() => { goTo(page); setSelectedAnn(a.id); }}>
                            <span className="swatch-dot" style={{ background: a.color }} /> Pág. {page + 1} · {{ highlight: 'Resaltado', rect: 'Recuadro', note: 'Nota', text: 'Texto', strike: 'Tachado' }[a.type]}{a.text ? `: ${a.text.slice(0, 40)}` : ''}
                          </button>
                          <IconButton icon={Trash2} label="Eliminar anotación" onClick={() => deleteAnnotation(a.id)} />
                        </li>
                      );
                    })}
                  </ul>
                  <p className="faint" style={{ fontSize: 12 }}>Las anotaciones se incrustan en el PDF al descargarlo o imprimirlo.</p>
                </section>
              )}
            </aside>
          )}
        </>
      ) : loadError ? (
        <div className="center-fill" role="alert">
          <h2>No se puede mostrar el PDF</h2>
          <p className="muted">{loadError}</p>
          <Button onClick={() => void alertDialog({ title: 'Detalles', message: loadError })}>Ver detalles</Button>
        </div>
      ) : (
        <div className="center-fill"><div className="spinner" /><span className="muted">Abriendo PDF…</span></div>
      )}
    </EditorShell>
  );
}
