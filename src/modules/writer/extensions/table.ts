import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

const cellAttrs = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || el.getAttribute('data-bg') || null,
    renderHTML: (attrs: Record<string, any>) => (attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {}),
  },
  verticalAlign: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.verticalAlign || null,
    renderHTML: (attrs: Record<string, any>) => (attrs.verticalAlign ? { style: `vertical-align:${attrs.verticalAlign}` } : {}),
  },
};

export const DocTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs };
  },
});

export const DocTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs };
  },
});

export const DocTable = Table.configure({ resizable: true, cellMinWidth: 40, allowTableNodeSelection: true });
export { TableRow as DocTableRow };
