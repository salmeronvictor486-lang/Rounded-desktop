import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { Download, FileCog, FileText, Printer } from 'lucide-react';
import type { EditorProps } from '@/app/types';
import { EditorShell, useCommonFileItems, type MenuDef } from '@/app/EditorShell';
import { usePreferences } from '@/app/preferences';
import { blobToDataUrl, downloadBlob, pickFiles } from '@/core/files/download';
import { isSafeImageSrc } from '@/core/files/validate';
import { mmToPx } from '@/core/util/units';
import { alertDialog, promptDialog } from '@/ui/dialogs';
import { reportError, toast } from '@/ui/toast';
import { buildExtensions } from './extensions';
import { WRITER_EXPORTS } from './formats';
import { normalizeWriterContent, pageDimensions, type PageSettings, type WriterContent } from './model';
import { printDocument } from './print';
import { documentStyleCss } from './styleCss';
import { BLOCK_STYLES, WriterToolbar, applyBlockStyle } from './ui/Toolbar';
import { FindReplacePanel } from './ui/FindReplacePanel';
import { FootnotesList, editFootnote } from './ui/Footnotes';
import { ImageBubble, TableBubble } from './ui/Menus';
import { InsertTableDialog } from './ui/InsertTableDialog';
import { PageSetupDialog } from './ui/PageSetupDialog';
import { usePagination } from './ui/usePagination';
import { useEditorView } from './ui/useEditorView';
import './writer.css';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function insertImageFiles(editor: Editor, files: File[], maxWidth: number, pos?: number) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`La imagen «${file.name}» supera los 15 MB.`);
      continue;
    }
    const src = await blobToDataUrl(file);
    if (!isSafeImageSrc(src)) {
      toast.error(`Formato de imagen no admitido: ${file.type}`);
      continue;
    }
    const img = new Image();
    img.src = src;
    await img.decode().catch(() => undefined);
    const width = img.naturalWidth ? Math.min(img.naturalWidth, Math.round(maxWidth)) : null;
    const node = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, ''), width, align: 'center' } };
    if (pos !== undefined) editor.chain().focus().insertContentAt(pos, node).run();
    else editor.chain().focus().insertContent(node).run();
  }
}

function StatusBar({ editor, pages, zoom, setZoom }: { editor: Editor; pages: number; zoom: number; setZoom: (z: number) => void }) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ words: e.storage.characterCount?.words?.() ?? 0, chars: e.storage.characterCount?.characters?.() ?? 0 }),
  });
  return (
    <footer className="statusbar" aria-label="Estado del documento">
      <span>{pages} {pages === 1 ? 'página' : 'páginas'}</span>
      <span>{counts.words.toLocaleString('es')} palabras</span>
      <span>{counts.chars.toLocaleString('es')} caracteres</span>
      <div className="spacer" />
      <label className="row" style={{ gap: 6 }}>
        <span className="sr-only">Zoom</span>
        <input type="range" min={50} max={200} step={10} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
        <span style={{ width: 40 }}>{zoom}%</span>
      </label>
    </footer>
  );
}

export default function WriterEditor({ session }: EditorProps<WriterContent>) {
  const initial = useMemo(() => normalizeWriterContent(session.initialContent), [session]);
  const [page, setPage] = useState<PageSettings>(initial.page);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [zoom, setZoom] = useState(100);
  const [panel, setPanel] = useState<null | 'find' | 'replace'>(null);
  const [pageSetup, setPageSetup] = useState(false);
  const [tableDialog, setTableDialog] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const prefs = usePreferences();

  const dims = pageDimensions(page);
  const pageWidthPx = mmToPx(dims.width);
  const contentWidthPx = mmToPx(dims.width - page.margins.left - page.margins.right);
  const contentHeightPx = mmToPx(dims.height - page.margins.top - page.margins.bottom);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: initial.doc,
    autofocus: 'start',
    editorProps: {
      attributes: { class: 'doc-content', 'aria-label': 'Contenido del documento', 'aria-multiline': 'true', role: 'textbox' },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        void insertImageFiles(editorRef.current!, files, view.dom.clientWidth);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImageFiles(editorRef.current!, files, view.dom.clientWidth, pos);
        return true;
      },
      handleDoubleClickOn: (_view, pos, node) => {
        if (node.type.name === 'footnote') {
          void editFootnote(editorRef.current!, pos);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => session.markDirty(),
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  useEffect(() => {
    session.setSerializer(() => ({ ...initial, doc: editorRef.current?.getJSON() ?? initial.doc, page: pageRef.current }));
  }, [session, initial]);

  const view = useEditorView(editor);
  useEffect(() => {
    if (!view) return;
    const dom = view.dom as HTMLElement;
    dom.setAttribute('spellcheck', String(prefs.spellcheck));
    dom.setAttribute('lang', initial.language?.slice(0, 2) || prefs.spellLang);
  }, [view, prefs.spellcheck, prefs.spellLang, initial.language]);

  const marks = usePagination(editor, contentHeightPx, [page, zoom]);

  const updatePage = (p: PageSettings) => {
    setPage(p);
    session.markDirty();
  };

  const currentContent = useCallback((): WriterContent => ({ ...initial, doc: editorRef.current!.getJSON(), page: pageRef.current }), [initial]);

  const doPrint = useCallback(async () => {
    try {
      await printDocument(currentContent(), session.file.name);
    } catch (e) {
      reportError(e, 'No se pudo imprimir');
    }
  }, [currentContent, session.file.name]);

  const doExport = async (id: string) => {
    const opt = WRITER_EXPORTS.find((x) => x.id === id)!;
    try {
      await session.flush();
      const blob = await opt.run(currentContent(), session.file.name);
      downloadBlob(blob, `${session.file.name}.${opt.extension}`);
      toast.success(`Descargado como ${opt.extension.toUpperCase()}.`);
    } catch (e) {
      reportError(e, 'No se pudo exportar');
    }
  };

  const insertImage = async () => {
    if (!editor) return;
    const files = await pickFiles('image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp', true);
    await insertImageFiles(editor, files, contentWidthPx);
  };

  const setLink = async () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href ?? '';
    const href = await promptDialog({ title: 'Enlace', message: 'Dirección (https://…, mailto:…) — deja vacío para quitar el enlace', defaultValue: prev || 'https://' });
    if (href === null) return;
    if (!href.trim() || href === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const ok = editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
    if (!ok) toast.error('La dirección no es válida o usa un protocolo no permitido.');
    else if (editor.state.selection.empty && !prev) editor.chain().focus().insertContent({ type: 'text', text: href.trim(), marks: [{ type: 'link', attrs: { href: href.trim() } }] }).run();
  };

  const insertNote = async (kind: 'footnote' | 'endnote') => {
    if (!editor) return;
    const text = await promptDialog({ title: kind === 'footnote' ? 'Insertar nota al pie' : 'Insertar nota final', message: 'Texto de la nota', confirmLabel: 'Insertar' });
    if (text) editor.chain().focus().insertFootnote(text, kind).run();
  };

  // Atajos de teclado globales del editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && !e.shiftKey) {
        e.preventDefault();
        setPanel('find');
      } else if (k === 'h') {
        e.preventDefault();
        setPanel('replace');
      } else if (k === 'p') {
        e.preventDefault();
        void doPrint();
      } else if (k === 's') {
        e.preventDefault();
        void session.flush().then(() => toast.success('Documento guardado.'));
      } else if (k === 'k') {
        e.preventDefault();
        void setLink();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doPrint]);

  const fileItems = useCommonFileItems(() => setVersionsOpen(true));
  if (!editor) return null;

  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: () => [
        ...fileItems.slice(0, 3),
        { type: 'separator' },
        { label: 'Descargar como', icon: Download, submenu: WRITER_EXPORTS.map((x) => ({ label: x.label, onSelect: () => void doExport(x.id) })) },
        {
          label: 'Exportar a PDF…',
          icon: FileText,
          onSelect: () => {
            toast.info('En el diálogo de impresión elige «Guardar como PDF» como destino.');
            void doPrint();
          },
        },
        { label: 'Imprimir…', icon: Printer, shortcut: 'Ctrl+P', onSelect: () => void doPrint() },
        { label: 'Configurar página…', icon: FileCog, onSelect: () => setPageSetup(true) },
        ...fileItems.slice(3),
      ],
    },
    {
      label: 'Editar',
      items: () => [
        { label: 'Deshacer', shortcut: 'Ctrl+Z', disabled: !editor.can().undo(), onSelect: () => editor.chain().focus().undo().run() },
        { label: 'Rehacer', shortcut: 'Ctrl+Y', disabled: !editor.can().redo(), onSelect: () => editor.chain().focus().redo().run() },
        { type: 'separator' },
        { label: 'Cortar', shortcut: 'Ctrl+X', onSelect: () => { editor.commands.focus(); document.execCommand('cut'); } },
        { label: 'Copiar', shortcut: 'Ctrl+C', onSelect: () => { editor.commands.focus(); document.execCommand('copy'); } },
        {
          label: 'Pegar como texto sin formato',
          shortcut: 'Ctrl+Mayús+V',
          onSelect: async () => {
            try {
              const text = await navigator.clipboard.readText();
              editor.chain().focus().insertContent(text.split(/\r?\n/).map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] }))).run();
            } catch {
              toast.warning('El navegador no permite leer el portapapeles. Usa Ctrl+Mayús+V.');
            }
          },
        },
        { label: 'Seleccionar todo', shortcut: 'Ctrl+A', onSelect: () => editor.chain().focus().selectAll().run() },
        { type: 'separator' },
        { label: 'Buscar…', shortcut: 'Ctrl+F', onSelect: () => setPanel('find') },
        { label: 'Buscar y reemplazar…', shortcut: 'Ctrl+H', onSelect: () => setPanel('replace') },
      ],
    },
    {
      label: 'Insertar',
      items: () => [
        { label: 'Imagen…', onSelect: () => void insertImage() },
        { label: 'Tabla…', onSelect: () => setTableDialog(true) },
        { label: 'Enlace…', shortcut: 'Ctrl+K', onSelect: () => void setLink() },
        { type: 'separator' },
        { label: 'Salto de página', shortcut: 'Ctrl+Intro', onSelect: () => editor.chain().focus().setPageBreak().run() },
        { label: 'Línea horizontal', onSelect: () => editor.chain().focus().setHorizontalRule().run() },
        { label: 'Índice (tabla de contenido)', onSelect: () => editor.chain().focus().insertTableOfContents().run() },
        { type: 'separator' },
        { label: 'Nota al pie…', onSelect: () => void insertNote('footnote') },
        { label: 'Nota final…', onSelect: () => void insertNote('endnote') },
        { type: 'separator' },
        { label: 'Fecha de hoy', onSelect: () => editor.chain().focus().insertContent(new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })).run() },
      ],
    },
    {
      label: 'Formato',
      items: () => [
        { label: 'Negrita', shortcut: 'Ctrl+B', checked: editor.isActive('bold'), onSelect: () => editor.chain().focus().toggleBold().run() },
        { label: 'Cursiva', shortcut: 'Ctrl+I', checked: editor.isActive('italic'), onSelect: () => editor.chain().focus().toggleItalic().run() },
        { label: 'Subrayado', shortcut: 'Ctrl+U', checked: editor.isActive('underline'), onSelect: () => editor.chain().focus().toggleUnderline().run() },
        { label: 'Tachado', checked: editor.isActive('strike'), onSelect: () => editor.chain().focus().toggleStrike().run() },
        { label: 'Superíndice', shortcut: 'Ctrl+.', checked: editor.isActive('superscript'), onSelect: () => editor.chain().focus().toggleSuperscript().run() },
        { label: 'Subíndice', shortcut: 'Ctrl+,', checked: editor.isActive('subscript'), onSelect: () => editor.chain().focus().toggleSubscript().run() },
        { label: 'Código en línea', checked: editor.isActive('code'), onSelect: () => editor.chain().focus().toggleCode().run() },
        { type: 'separator' },
        { label: 'Estilos de párrafo', submenu: BLOCK_STYLES.map((b) => ({ label: b.label, onSelect: () => applyBlockStyle(editor, b.id) })) },
        {
          label: 'Listas',
          submenu: [
            { label: 'Con viñetas', onSelect: () => editor.chain().focus().toggleBulletList().run() },
            { label: 'Numerada', onSelect: () => editor.chain().focus().toggleOrderedList().run() },
            { label: 'Aumentar nivel', shortcut: 'Tab', onSelect: () => editor.chain().focus().sinkListItem('listItem').run() },
            { label: 'Reducir nivel', shortcut: 'Mayús+Tab', onSelect: () => editor.chain().focus().liftListItem('listItem').run() },
          ],
        },
        {
          label: 'Sangría',
          submenu: [
            { label: 'Aumentar sangría', onSelect: () => editor.chain().focus().indent().run() },
            { label: 'Reducir sangría', onSelect: () => editor.chain().focus().outdent().run() },
            { label: 'Sangría de primera línea (1,25 cm)', onSelect: () => editor.chain().focus().setFirstLineIndent(47).run() },
            { label: 'Sangría francesa (1,25 cm)', onSelect: () => editor.chain().focus().setFirstLineIndent(-47).run() },
            { label: 'Quitar sangría de primera línea', onSelect: () => editor.chain().focus().setFirstLineIndent(null).run() },
          ],
        },
        { type: 'separator' },
        { label: 'Borrar formato', onSelect: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
      ],
    },
    {
      label: 'Tabla',
      items: () => {
        const inTable = editor.isActive('table');
        return [
          { label: 'Insertar tabla…', onSelect: () => setTableDialog(true) },
          { type: 'separator' },
          { label: 'Insertar fila encima', disabled: !inTable, onSelect: () => editor.chain().focus().addRowBefore().run() },
          { label: 'Insertar fila debajo', disabled: !inTable, onSelect: () => editor.chain().focus().addRowAfter().run() },
          { label: 'Insertar columna a la izquierda', disabled: !inTable, onSelect: () => editor.chain().focus().addColumnBefore().run() },
          { label: 'Insertar columna a la derecha', disabled: !inTable, onSelect: () => editor.chain().focus().addColumnAfter().run() },
          { type: 'separator' },
          { label: 'Combinar celdas', disabled: !editor.can().mergeCells(), onSelect: () => editor.chain().focus().mergeCells().run() },
          { label: 'Dividir celda', disabled: !editor.can().splitCell(), onSelect: () => editor.chain().focus().splitCell().run() },
          { label: 'Fila de encabezado', disabled: !inTable, onSelect: () => editor.chain().focus().toggleHeaderRow().run() },
          { type: 'separator' },
          { label: 'Eliminar fila', disabled: !inTable, danger: true, onSelect: () => editor.chain().focus().deleteRow().run() },
          { label: 'Eliminar columna', disabled: !inTable, danger: true, onSelect: () => editor.chain().focus().deleteColumn().run() },
          { label: 'Eliminar tabla', disabled: !inTable, danger: true, onSelect: () => editor.chain().focus().deleteTable().run() },
        ];
      },
    },
    {
      label: 'Ver',
      items: () => [
        { label: 'Mostrar saltos de página', checked: showGuides, onSelect: () => setShowGuides((v) => !v) },
        { type: 'separator' },
        ...[75, 100, 125, 150].map((z) => ({ label: `Zoom ${z}%`, checked: zoom === z, onSelect: () => setZoom(z) })),
        {
          label: 'Ajustar al ancho',
          onSelect: () => {
            const avail = (document.querySelector('.doc-scroll') as HTMLElement | null)?.clientWidth ?? 900;
            setZoom(Math.max(50, Math.min(200, Math.floor(((avail - 48) / pageWidthPx) * 10) * 10)));
          },
        },
      ],
    },
    {
      label: 'Herramientas',
      items: () => [
        {
          label: 'Recuento de palabras',
          onSelect: () => {
            const words = editor.storage.characterCount.words();
            const chars = editor.storage.characterCount.characters();
            const noSpaces = editor.getText().replace(/\s/g, '').length;
            const paragraphs = editor.getJSON().content?.filter((n) => n.type === 'paragraph' && n.content?.length).length ?? 0;
            void alertDialog({
              title: 'Recuento de palabras',
              message: `Páginas (aprox.): ${marks.length + 1}\nPalabras: ${words}\nCaracteres (con espacios): ${chars}\nCaracteres (sin espacios): ${noSpaces}\nPárrafos: ${paragraphs}`,
            });
          },
        },
        { label: prefs.spellcheck ? 'Desactivar corrección ortográfica' : 'Activar corrección ortográfica', onSelect: () => prefs.set({ spellcheck: !prefs.spellcheck }) },
      ],
    },
  ];

  const pageStyle: React.CSSProperties = {
    width: pageWidthPx,
    minHeight: mmToPx(dims.height),
    padding: `${mmToPx(page.margins.top)}px ${mmToPx(page.margins.right)}px ${mmToPx(page.margins.bottom)}px ${mmToPx(page.margins.left)}px`,
    zoom: zoom / 100,
  };
  const scopeCss = documentStyleCss(initial.styles, '.doc-page .doc-content');

  return (
    <EditorShell
      menus={menus}
      versionsOpen={versionsOpen}
      onVersionsClose={() => setVersionsOpen(false)}
      toolbar={
        <WriterToolbar
          editor={editor}
          toolbarRef={toolbarRef}
          onPrint={() => void doPrint()}
          onInsertImage={() => void insertImage()}
          onInsertTable={() => setTableDialog(true)}
          onLink={() => void setLink()}
          onFind={() => setPanel('find')}
        />
      }
    >
      <div className="writer-main">
        {scopeCss && <style>{scopeCss}</style>}
        <div
          className="doc-scroll"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !panel) toolbarRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
          }}
        >
          <div className={`doc-page cols-${page.columns}`} style={{ ...pageStyle, ['--col-gap' as string]: `${mmToPx(page.columnGap)}px` }}>
            {page.header.text && (
              <div className="doc-hf doc-header" style={{ top: mmToPx(page.margins.top) / 2 - 8, left: mmToPx(page.margins.left), right: mmToPx(page.margins.right), textAlign: page.header.align }}>
                {page.header.text.replace(/\{page\}/g, '1').replace(/\{pages\}/g, String(marks.length + 1))}
              </div>
            )}
            <div className="doc-flow">
              <EditorContent editor={editor} />
              {showGuides &&
                marks.map((m) => (
                  <div key={`${m.page}-${m.top}`} className={`page-guide ${m.manual ? 'is-manual' : ''}`} style={{ top: m.top, left: -mmToPx(page.margins.left), right: -mmToPx(page.margins.right) }} aria-hidden="true">
                    <span>Página {m.page}</span>
                  </div>
                ))}
            </div>
            <FootnotesList editor={editor} />
            {page.footer.text && (
              <div className="doc-hf doc-footer" style={{ bottom: mmToPx(page.margins.bottom) / 2 - 8, left: mmToPx(page.margins.left), right: mmToPx(page.margins.right), textAlign: page.footer.align }}>
                {page.footer.text.replace(/\{page\}/g, String(marks.length + 1)).replace(/\{pages\}/g, String(marks.length + 1))}
              </div>
            )}
          </div>
        </div>
        <StatusBar editor={editor} pages={marks.length + 1} zoom={zoom} setZoom={setZoom} />
      </div>
      {panel && <FindReplacePanel editor={editor} focusReplace={panel === 'replace'} onClose={() => { setPanel(null); editor.commands.focus(); }} />}
      <ImageBubble editor={editor} />
      <TableBubble editor={editor} />
      <PageSetupDialog open={pageSetup} page={page} onClose={() => setPageSetup(false)} onApply={updatePage} />
      <InsertTableDialog open={tableDialog} onClose={() => setTableDialog(false)} onInsert={(rows, cols, withHeaderRow) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow }).run()} />
    </EditorShell>
  );
}
