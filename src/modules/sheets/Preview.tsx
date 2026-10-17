import { useMemo } from 'react';
import { SheetController } from './controller';
import { cellDisplay } from './ops/display';
import { DEFAULT_COL_WIDTH, type Workbook } from './model';
import { colToLetters } from './engine/address';
import './sheets.css';

/** Miniatura de la primera hoja (primeras filas y columnas). */
export default function SheetsPreview({ content }: { content: Workbook }) {
  const ctl = useMemo(() => new SheetController(structuredClone(content)), [content]);
  const sheet = ctl.wb.sheets[0];
  const rows = 14;
  const cols = 7;
  return (
    <div className="sheet-preview" aria-hidden="true">
      <table>
        <thead>
          <tr>
            <th />
            {Array.from({ length: cols }, (_, c) => <th key={c} style={{ width: (sheet.colWidths[c] ?? DEFAULT_COL_WIDTH) * 0.6 }}>{colToLetters(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <th>{r + 1}</th>
              {Array.from({ length: cols }, (_, c) => {
                const d = cellDisplay(ctl, sheet, r, c);
                return (
                  <td key={c} style={{ background: d.style.bg, color: d.color ?? d.style.color, fontWeight: d.style.bold ? 700 : undefined, textAlign: d.align }}>
                    {d.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
