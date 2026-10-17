import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Search,
  Strikethrough,
  Table2,
  Type,
  Underline,
  Undo2,
  BetweenHorizontalStart,
} from 'lucide-react';
import { IconButton } from '@/ui/Button';
import { ColorPickerButton } from '@/ui/ColorPicker';
import { MenuButton } from '@/ui/Menu';

export const FONT_FAMILIES = [
  { label: 'Predeterminada', value: '' },
  { label: 'Calibri', value: 'Calibri, Carlito, sans-serif' },
  { label: 'Arial', value: 'Arial, "Liberation Sans", Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, "DejaVu Sans", sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", system-ui, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", "Liberation Serif", Times, serif' },
  { label: 'Georgia', value: 'Georgia, "DejaVu Serif", serif' },
  { label: 'Cambria', value: 'Cambria, Caladea, Georgia, serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", serif' },
  { label: 'Courier New', value: '"Courier New", "Liberation Mono", monospace' },
];

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

export const BLOCK_STYLES = [
  { id: 'p', label: 'Texto normal' },
  { id: 'h1', label: 'Título 1' },
  { id: 'h2', label: 'Título 2' },
  { id: 'h3', label: 'Título 3' },
  { id: 'h4', label: 'Título 4' },
  { id: 'quote', label: 'Cita' },
  { id: 'code', label: 'Código' },
];

function currentBlock(editor: Editor): string {
  for (let l = 1; l <= 6; l++) if (editor.isActive('heading', { level: l })) return `h${l}`;
  if (editor.isActive('blockquote')) return 'quote';
  if (editor.isActive('codeBlock')) return 'code';
  return 'p';
}

export function applyBlockStyle(editor: Editor, id: string) {
  const chain = editor.chain().focus();
  if (id === 'p') {
    if (editor.isActive('blockquote')) chain.lift('blockquote');
    chain.setParagraph().run();
  } else if (id.startsWith('h')) chain.setHeading({ level: Number(id.slice(1)) as 1 }).run();
  else if (id === 'quote') chain.toggleBlockquote().run();
  else if (id === 'code') chain.toggleCodeBlock().run();
}

function parsePt(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return v.endsWith('px') ? Math.round(n * 0.75 * 2) / 2 : n;
}

interface Props {
  editor: Editor;
  onPrint: () => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
  onLink: () => void;
  onFind: () => void;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
}

export function WriterToolbar({ editor, onPrint, onInsertImage, onInsertTable, onLink, onFind, toolbarRef }: Props) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      block: currentBlock(e),
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      size: parsePt(e.getAttributes('textStyle').fontSize as string | undefined),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      lineHeight: (e.getAttributes('paragraph').lineHeight ?? e.getAttributes('heading').lineHeight ?? null) as number | null,
    }),
  });

  const setSize = (pt: number) => editor.chain().focus().setFontSize(`${pt}pt`).run();
  const sizeValue = s.size ?? 11;
  const step = (dir: 1 | -1) => {
    const idx = FONT_SIZES.findIndex((x) => x >= sizeValue);
    const next = dir > 0 ? FONT_SIZES[Math.min(FONT_SIZES.length - 1, (FONT_SIZES[idx] === sizeValue ? idx : idx - 1) + 1)] : FONT_SIZES[Math.max(0, (idx < 0 ? FONT_SIZES.length : idx) - 1)];
    if (next) setSize(next);
  };
  const fontKnown = FONT_FAMILIES.some((f) => f.value === s.font);

  return (
    <div className="toolbar" role="toolbar" aria-label="Formato del documento" ref={toolbarRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') editor.commands.focus();
      }}>
      <div className="toolbar-group">
        <IconButton icon={Undo2} label="Deshacer (Ctrl+Z)" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <IconButton icon={Redo2} label="Rehacer (Ctrl+Y)" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()} />
        <IconButton icon={Printer} label="Imprimir o guardar como PDF (Ctrl+P)" onClick={onPrint} />
      </div>
      <div className="toolbar-sep" />
      <select className="select select-sm" aria-label="Estilo de párrafo" value={s.block} onChange={(e) => applyBlockStyle(editor, e.target.value)} style={{ width: 130 }}>
        {BLOCK_STYLES.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <select
        className="select select-sm"
        aria-label="Fuente"
        value={fontKnown ? s.font : '__custom'}
        style={{ width: 132 }}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
      >
        {!fontKnown && <option value="__custom">{s.font.split(',')[0].replace(/"/g, '')}</option>}
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value} style={{ fontFamily: f.value || undefined }}>
            {f.label}
          </option>
        ))}
      </select>
      <div className="toolbar-group">
        <IconButton icon={Minus} label="Reducir tamaño de fuente" size={14} onClick={() => step(-1)} />
        <input
          className="input input-sm"
          aria-label="Tamaño de fuente (pt)"
          style={{ width: 46, textAlign: 'center' }}
          key={sizeValue}
          defaultValue={sizeValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseFloat((e.target as HTMLInputElement).value.replace(',', '.'));
              if (v >= 1 && v <= 400) setSize(v);
            }
          }}
          onBlur={(e) => {
            const v = parseFloat(e.target.value.replace(',', '.'));
            if (v >= 1 && v <= 400 && v !== sizeValue) setSize(v);
          }}
        />
        <IconButton icon={Plus} label="Aumentar tamaño de fuente" size={14} onClick={() => step(1)} />
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={Bold} label="Negrita (Ctrl+B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
        <IconButton icon={Italic} label="Cursiva (Ctrl+I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <IconButton icon={Underline} label="Subrayado (Ctrl+U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <IconButton icon={Strikethrough} label="Tachado (Ctrl+Mayús+X)" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ColorPickerButton label="Color del texto" value={s.color} allowNone noneLabel="Automático" onChange={(c) => (c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run())}>
          <span className="color-indicator">
            <Type size={16} aria-hidden="true" />
            <span className="color-bar" style={{ background: s.color ?? 'currentColor' }} />
          </span>
        </ColorPickerButton>
        <ColorPickerButton label="Color de resaltado" value={s.highlight} allowNone noneLabel="Sin resaltado" onChange={(c) => (c ? editor.chain().focus().setHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run())}>
          <span className="color-indicator">
            <Highlighter size={16} aria-hidden="true" />
            <span className="color-bar" style={{ background: s.highlight ?? '#fde047' }} />
          </span>
        </ColorPickerButton>
        <IconButton icon={Link2} label="Insertar enlace (Ctrl+K)" active={s.link} onClick={onLink} />
        <IconButton icon={RemoveFormatting} label="Borrar formato" onClick={() => editor.chain().focus().unsetAllMarks().run()} />
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={AlignLeft} label="Alinear a la izquierda (Ctrl+Mayús+L)" active={s.align === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <IconButton icon={AlignCenter} label="Centrar (Ctrl+Mayús+E)" active={s.align === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <IconButton icon={AlignRight} label="Alinear a la derecha (Ctrl+Mayús+R)" active={s.align === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
        <IconButton icon={AlignJustify} label="Justificar (Ctrl+Mayús+J)" active={s.align === 'justify'} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
        <MenuButton
          className="icon-btn"
          label="Interlineado y espaciado"
          items={[
            ...[1, 1.15, 1.5, 2, 2.5, 3].map((v) => ({
              label: String(v).replace('.', ','),
              checked: (s.lineHeight ?? 1.15) === v,
              onSelect: () => editor.chain().focus().setLineHeight(v).run(),
            })),
            { type: 'separator' as const },
            { label: 'Añadir espacio antes', onSelect: () => editor.chain().focus().setParagraphSpacing({ before: 12 }).run() },
            { label: 'Añadir espacio después', onSelect: () => editor.chain().focus().setParagraphSpacing({ after: 12 }).run() },
            { label: 'Quitar espaciado personalizado', onSelect: () => editor.chain().focus().setParagraphSpacing({ before: null, after: null }).run() },
          ]}
        >
          <BetweenHorizontalStart size={17} aria-hidden="true" />
        </MenuButton>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={List} label="Lista con viñetas (Ctrl+Mayús+8)" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <IconButton icon={ListOrdered} label="Lista numerada (Ctrl+Mayús+7)" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <IconButton
          icon={IndentDecrease}
          label="Reducir sangría (Mayús+Tab)"
          onClick={() => (editor.isActive('listItem') ? editor.chain().focus().liftListItem('listItem').run() : editor.chain().focus().outdent().run())}
        />
        <IconButton
          icon={IndentIncrease}
          label="Aumentar sangría (Tab)"
          onClick={() => (editor.isActive('listItem') ? editor.chain().focus().sinkListItem('listItem').run() : editor.chain().focus().indent().run())}
        />
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={ImagePlus} label="Insertar imagen" onClick={onInsertImage} />
        <IconButton icon={Table2} label="Insertar tabla" onClick={onInsertTable} />
        <IconButton icon={Search} label="Buscar y reemplazar (Ctrl+F)" onClick={onFind} />
      </div>
    </div>
  );
}
