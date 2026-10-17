import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  LayoutTemplate,
  List,
  ListOrdered,
  Minus,
  MoveUpRight,
  Plus,
  Redo2,
  Shapes,
  Strikethrough,
  Table2,
  Type,
  Underline,
  Undo2,
  Layers,
  AlignHorizontalJustifyCenter,
} from 'lucide-react';
import { IconButton } from '@/ui/Button';
import { ColorPickerButton } from '@/ui/ColorPicker';
import { MenuButton, type MenuItem } from '@/ui/Menu';
import type { SlidesStore } from '../store';
import { LAYOUTS } from '../layouts';
import { SHAPES } from '../shapes';
import { allHaveMark, clearTextStyleAttr, firstAlign, firstTextStyle, setAlignAll, setMarkAll, setTextStyleAll } from '../textOps';
import type { JSONContent } from '@tiptap/core';
import type { ShapeKind, SlideElement, TextFontDefaults } from '../model';

export const SLIDE_FONTS = ['Inter', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Segoe UI', 'Georgia', 'Times New Roman', 'Garamond', 'Courier New', 'Comic Sans MS'];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88, 96];

interface Props {
  store: SlidesStore;
  editor: Editor | null;
  onInsertText: () => void;
  onInsertShape: (k: ShapeKind) => void;
  onInsertLine: (arrow: boolean) => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
}

function EditorFormat({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      align: (['left', 'center', 'right'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      size: parseFloat((e.getAttributes('textStyle').fontSize as string) ?? '') || 24,
      font: ((e.getAttributes('textStyle').fontFamily as string) ?? '').split(',')[0].replace(/"/g, ''),
      color: (e.getAttributes('textStyle').color as string) ?? null,
    }),
  });
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <>
      <select className="select select-sm" aria-label="Fuente" value={SLIDE_FONTS.includes(s.font) ? s.font : ''} style={{ width: 120 }} onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}>
        <option value="">{s.font || 'Fuente del tema'}</option>
        {SLIDE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select className="select select-sm" aria-label="Tamaño" value={SIZES.includes(Math.round(s.size)) ? Math.round(s.size) : ''} style={{ width: 64 }} onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}px`).run()}>
        {!SIZES.includes(Math.round(s.size)) && <option value="">{Math.round(s.size)}</option>}
        {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <div className="toolbar-group" onMouseDown={keep}>
        <IconButton icon={Bold} label="Negrita (Ctrl+B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
        <IconButton icon={Italic} label="Cursiva (Ctrl+I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <IconButton icon={Underline} label="Subrayado (Ctrl+U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <IconButton icon={Strikethrough} label="Tachado" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ColorPickerButton label="Color del texto" value={s.color} allowNone noneLabel="Color del tema" onChange={(c) => (c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run())}>
          <span className="color-indicator"><Type size={16} /><span className="color-bar" style={{ background: s.color ?? 'currentColor' }} /></span>
        </ColorPickerButton>
        <IconButton icon={AlignLeft} label="Alinear a la izquierda" active={s.align === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <IconButton icon={AlignCenter} label="Centrar" active={s.align === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <IconButton icon={AlignRight} label="Alinear a la derecha" active={s.align === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
        <IconButton icon={List} label="Viñetas" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <IconButton icon={ListOrdered} label="Numeración" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      </div>
    </>
  );
}

/** Formato aplicado a todo el texto de los elementos seleccionados (sin estar editando). */
function SelectionFormat({ store }: { store: SlidesStore }) {
  const textEls = store.selection.filter((e) => (e.type === 'text' || e.type === 'shape') && e.content);
  if (!textEls.length) return null;
  const first = textEls[0] as SlideElement & { content?: JSONContent };
  const firstFont = first.type === 'text' ? first.style.font ?? {} : {};
  const ids = textEls.map((e) => e.id);
  /** En cuadros de texto se cambia el formato del cuadro y se limpian las excepciones; en formas, el texto. */
  const apply = (box: Partial<TextFontDefaults>, runs: (c: JSONContent) => JSONContent) =>
    store.updateElements(ids, (e) => {
      if (e.type === 'text') {
        e.style = { ...e.style, font: { ...(e.style.font ?? {}), ...box } };
        e.content = runs(e.content);
      } else if (e.type === 'shape' && e.content) {
        e.content = runs(e.content);
      }
    });
  const bold = first.type === 'text' ? !!firstFont.bold || allHaveMark(first.content, 'bold') : allHaveMark(first.content, 'bold');
  const italic = first.type === 'text' ? !!firstFont.italic || allHaveMark(first.content, 'italic') : allHaveMark(first.content, 'italic');
  const underline = allHaveMark(first.content, 'underline');
  const size = parseFloat(firstTextStyle(first.content, 'fontSize') ?? '') || firstFont.size || 24;
  const font = (firstTextStyle(first.content, 'fontFamily') ?? firstFont.family ?? '').split(',')[0].replace(/"/g, '');
  const color = firstTextStyle(first.content, 'color') ?? firstFont.color ?? null;
  const align = firstAlign(first.content) ?? firstFont.align ?? 'left';
  return (
    <>
      <select className="select select-sm" aria-label="Fuente" value={SLIDE_FONTS.includes(font) ? font : ''} style={{ width: 120 }}
        onChange={(e) => apply({ family: e.target.value }, (c) => (first.type === 'text' ? clearTextStyleAttr(c, 'fontFamily') : setTextStyleAll(c, { fontFamily: e.target.value })))}>
        <option value="">{font || 'Fuente del tema'}</option>
        {SLIDE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <div className="toolbar-group">
        <IconButton icon={Minus} label="Reducir tamaño" size={14} onClick={() => { const n = Math.max(8, Math.round(size - 2)); apply({ size: n }, (c) => setTextStyleAll(c, { fontSize: `${n}px` })); }} />
        <span className="size-label" aria-label="Tamaño de letra">{Math.round(size)}</span>
        <IconButton icon={Plus} label="Aumentar tamaño" size={14} onClick={() => { const n = Math.round(size + 2); apply({ size: n }, (c) => setTextStyleAll(c, { fontSize: `${n}px` })); }} />
      </div>
      <div className="toolbar-group">
        <IconButton icon={Bold} label="Negrita" active={bold} onClick={() => apply({ bold: !bold }, (c) => setMarkAll(c, 'bold', first.type === 'text' ? false : !bold))} />
        <IconButton icon={Italic} label="Cursiva" active={italic} onClick={() => apply({ italic: !italic }, (c) => setMarkAll(c, 'italic', first.type === 'text' ? false : !italic))} />
        <IconButton icon={Underline} label="Subrayado" active={underline} onClick={() => apply({}, (c) => setMarkAll(c, 'underline', !underline))} />
        <ColorPickerButton label="Color del texto" value={color} onChange={(c) => c && apply({ color: c }, (x) => setTextStyleAll(x, { color: c }))}>
          <span className="color-indicator"><Type size={16} /><span className="color-bar" style={{ background: color ?? 'currentColor' }} /></span>
        </ColorPickerButton>
        <IconButton icon={AlignLeft} label="Alinear a la izquierda" active={align === 'left'} onClick={() => apply({ align: 'left' }, (c) => setAlignAll(c, 'left'))} />
        <IconButton icon={AlignCenter} label="Centrar" active={align === 'center'} onClick={() => apply({ align: 'center' }, (c) => setAlignAll(c, 'center'))} />
        <IconButton icon={AlignRight} label="Alinear a la derecha" active={align === 'right'} onClick={() => apply({ align: 'right' }, (c) => setAlignAll(c, 'right'))} />
      </div>
    </>
  );
}

export function SlidesToolbar({ store, editor, onInsertText, onInsertShape, onInsertLine, onInsertImage, onInsertTable }: Props) {
  const layoutItems: MenuItem[] = LAYOUTS.map((l) => ({ label: l.label, onSelect: () => store.addSlide(l.id) }));
  const arrange: MenuItem[] = [
    { label: 'Traer al frente', onSelect: () => store.reorder('front') },
    { label: 'Traer adelante', onSelect: () => store.reorder('forward') },
    { label: 'Enviar atrás', onSelect: () => store.reorder('backward') },
    { label: 'Enviar al fondo', onSelect: () => store.reorder('back') },
  ];
  const alignItems: MenuItem[] = [
    { label: 'Alinear a la izquierda', onSelect: () => store.align('left') },
    { label: 'Centrar horizontalmente', onSelect: () => store.align('hcenter') },
    { label: 'Alinear a la derecha', onSelect: () => store.align('right') },
    { type: 'separator' },
    { label: 'Alinear arriba', onSelect: () => store.align('top') },
    { label: 'Centrar verticalmente', onSelect: () => store.align('vcenter') },
    { label: 'Alinear abajo', onSelect: () => store.align('bottom') },
    { type: 'separator' },
    { label: 'Distribuir horizontalmente', disabled: store.selected.length < 3, onSelect: () => store.distribute('h') },
    { label: 'Distribuir verticalmente', disabled: store.selected.length < 3, onSelect: () => store.distribute('v') },
  ];
  return (
    <div className="toolbar" role="toolbar" aria-label="Herramientas de diapositiva">
      <div className="toolbar-group">
        <IconButton icon={Undo2} label="Deshacer (Ctrl+Z)" disabled={!store.canUndo()} onClick={() => store.undo()} />
        <IconButton icon={Redo2} label="Rehacer (Ctrl+Y)" disabled={!store.canRedo()} onClick={() => store.redo()} />
      </div>
      <div className="toolbar-sep" />
      <MenuButton className="btn btn-sm" label="Nueva diapositiva" items={layoutItems}>
        <LayoutTemplate size={15} /> <span>Nueva diapositiva</span>
      </MenuButton>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={Type} label="Cuadro de texto" onClick={onInsertText} />
        <MenuButton className="icon-btn" label="Formas" items={SHAPES.map((s) => ({ label: s.label, onSelect: () => onInsertShape(s.id) }))}>
          <Shapes size={17} />
        </MenuButton>
        <IconButton icon={Minus} label="Línea" onClick={() => onInsertLine(false)} />
        <IconButton icon={MoveUpRight} label="Flecha" onClick={() => onInsertLine(true)} />
        <IconButton icon={ImagePlus} label="Imagen" onClick={onInsertImage} />
        <IconButton icon={Table2} label="Tabla" onClick={onInsertTable} />
      </div>
      <div className="toolbar-sep" />
      {editor ? <EditorFormat editor={editor} /> : <SelectionFormat store={store} />}
      {store.selected.length > 0 && (
        <>
          <div className="toolbar-sep" />
          <MenuButton className="icon-btn" label="Organizar (orden de capas)" items={arrange}><Layers size={17} /></MenuButton>
          <MenuButton className="icon-btn" label="Alinear y distribuir" items={alignItems}><AlignHorizontalJustifyCenter size={17} /></MenuButton>
        </>
      )}
    </div>
  );
}
