import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Columns3, Merge, Rows3, Split, Trash2, PaintBucket, Heading } from 'lucide-react';
import { IconButton } from '@/ui/Button';
import { ColorPickerButton } from '@/ui/ColorPicker';
import { MenuButton } from '@/ui/Menu';
import { promptDialog } from '@/ui/dialogs';

export function ImageBubble({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} pluginKey="imageBubble" shouldShow={({ editor: e }) => e.isActive('image')} className="bubble" options={{ placement: 'top' }}>
      {[25, 50, 75, 100].map((pct) => (
        <button key={pct} type="button" className="icon-btn" onClick={() => {
          const dom = editor.view.dom as HTMLElement;
          const width = Math.round((dom.clientWidth * pct) / 100);
          editor.chain().focus().updateAttributes('image', { width }).run();
        }}>{pct}%</button>
      ))}
      <IconButton icon={AlignLeft} label="Alinear imagen a la izquierda" onClick={() => editor.chain().focus().updateAttributes('image', { align: 'left' }).run()} />
      <IconButton icon={AlignCenter} label="Centrar imagen" onClick={() => editor.chain().focus().updateAttributes('image', { align: 'center' }).run()} />
      <IconButton icon={AlignRight} label="Alinear imagen a la derecha" onClick={() => editor.chain().focus().updateAttributes('image', { align: 'right' }).run()} />
      <button type="button" className="icon-btn" onClick={async () => {
        const alt = await promptDialog({ title: 'Texto alternativo', message: 'Describe la imagen para lectores de pantalla', defaultValue: editor.getAttributes('image').alt ?? '' });
        if (alt !== null) editor.chain().focus().updateAttributes('image', { alt }).run();
      }}>Texto alt.</button>
      <IconButton icon={Trash2} label="Eliminar imagen" onClick={() => editor.chain().focus().deleteSelection().run()} />
    </BubbleMenu>
  );
}

export function TableBubble({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} pluginKey="tableBubble" shouldShow={({ editor: e }) => e.isActive('table') && !e.isActive('image')} className="bubble" options={{ placement: 'top-start' }}>
      <MenuButton className="icon-btn" label="Filas" items={[
        { label: 'Insertar fila encima', onSelect: () => editor.chain().focus().addRowBefore().run() },
        { label: 'Insertar fila debajo', onSelect: () => editor.chain().focus().addRowAfter().run() },
        { label: 'Eliminar fila', danger: true, onSelect: () => editor.chain().focus().deleteRow().run() },
        { type: 'separator' },
        { label: 'Fila de encabezado', onSelect: () => editor.chain().focus().toggleHeaderRow().run() },
      ]}><Rows3 size={16} /></MenuButton>
      <MenuButton className="icon-btn" label="Columnas" items={[
        { label: 'Insertar columna a la izquierda', onSelect: () => editor.chain().focus().addColumnBefore().run() },
        { label: 'Insertar columna a la derecha', onSelect: () => editor.chain().focus().addColumnAfter().run() },
        { label: 'Eliminar columna', danger: true, onSelect: () => editor.chain().focus().deleteColumn().run() },
        { type: 'separator' },
        { label: 'Columna de encabezado', onSelect: () => editor.chain().focus().toggleHeaderColumn().run() },
      ]}><Columns3 size={16} /></MenuButton>
      <IconButton icon={Merge} label="Combinar celdas" disabled={!editor.can().mergeCells()} onClick={() => editor.chain().focus().mergeCells().run()} />
      <IconButton icon={Split} label="Dividir celda" disabled={!editor.can().splitCell()} onClick={() => editor.chain().focus().splitCell().run()} />
      <IconButton icon={Heading} label="Alternar celda de encabezado" onClick={() => editor.chain().focus().toggleHeaderCell().run()} />
      <ColorPickerButton label="Color de fondo de la celda" allowNone onChange={(c) => editor.chain().focus().setCellAttribute('backgroundColor', c).run()}>
        <PaintBucket size={16} />
      </ColorPickerButton>
      <IconButton icon={Trash2} label="Eliminar tabla" onClick={() => editor.chain().focus().deleteTable().run()} />
    </BubbleMenu>
  );
}
