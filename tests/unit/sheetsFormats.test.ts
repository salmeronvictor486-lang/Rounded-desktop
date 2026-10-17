import { beforeAll, describe, expect, it } from 'vitest';
import { SheetController } from '@/modules/sheets/controller';
import { createWorkbook, cellKey, internStyle } from '@/modules/sheets/model';
import { exportXlsx, importXlsx } from '@/modules/sheets/formats/xlsx';
import { exportOds, importOds, excelToOpenFormula, openFormulaToExcel } from '@/modules/sheets/formats/ods';
import { exportCsv, importCsv } from '@/modules/sheets/formats/csv';
import { setLocale } from '@/modules/sheets/format/locale';
import { Engine } from '@/modules/sheets/engine/engine';
import { addSheet } from '@/modules/sheets/ops/structure';

beforeAll(() => setLocale('es'));

async function bytesOf(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function sampleWorkbook() {
  const ctl = new SheetController(createWorkbook(['Ventas']));
  [['Producto', 'Unidades', 'Precio', 'Total'], ['Café', '10', '2,5', '=B2*C2'], ['Té', '4', '3', '=B3*C3'], ['', '', 'Suma', '=SUM(D2:D3)']].forEach((row, r) =>
    row.forEach((x, c) => x && ctl.setCellInput(r, c, x)),
  );
  ctl.applyStyle({ r1: 0, c1: 0, r2: 0, c2: 3 }, { bold: true, bg: '#dcfce7', hAlign: 'center' });
  ctl.applyStyle({ r1: 1, c1: 3, r2: 3, c2: 3 }, { numFmt: '#,##0.00 "€"' });
  ctl.sheet.merges.push({ r1: 5, c1: 0, r2: 5, c2: 2 });
  ctl.sheet.colWidths[0] = 160;
  ctl.sheet.freeze = { rows: 1, cols: 0 };
  ctl.sheet.validations.push({ id: 'v', range: { r1: 1, c1: 1, r2: 20, c2: 1 }, type: 'integer', values: ['0', '1000'], allowBlank: true, strict: true });
  ctl.sheet.conditional.push({ id: 'c', range: { r1: 1, c1: 3, r2: 20, c2: 3 }, type: 'gt', values: ['20'], style: { bg: '#fee2e2' } });
  addSheet(ctl);
  ctl.sheet.cells[cellKey(0, 0)] = { f: 'Ventas!D4/2' };
  ctl.engine.rebuild();
  return ctl.wb;
}

describe('XLSX', () => {
  it('ida y vuelta conserva valores, fórmulas, estilos, combinaciones, dimensiones, inmovilización, validación y formato condicional', async () => {
    const { blob } = await exportXlsx(sampleWorkbook());
    const { wb, warnings } = await importXlsx(await bytesOf(blob));
    expect(warnings).toEqual([]);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Ventas', 'Hoja2']);
    const s = wb.sheets[0];
    expect(s.cells[cellKey(1, 3)].f).toBe('B2*C2');
    expect(s.cells[cellKey(3, 3)].f).toBe('SUM(D2:D3)');
    expect(s.cells[cellKey(1, 2)].v).toBe(2.5);
    const head = wb.styles[s.cells[cellKey(0, 0)].s!];
    expect(head).toMatchObject({ bold: true, bg: '#dcfce7', hAlign: 'center' });
    expect(wb.styles[s.cells[cellKey(1, 3)].s!].numFmt).toBe('#,##0.00 "€"');
    expect(s.merges).toEqual([{ r1: 5, c1: 0, r2: 5, c2: 2 }]);
    expect(s.colWidths[0]).toBeCloseTo(160, -1);
    expect(s.freeze).toEqual({ rows: 1, cols: 0 });
    expect(s.validations[0]).toMatchObject({ type: 'integer', values: ['0', '1000'] });
    expect(s.conditional[0]).toMatchObject({ type: 'gt', values: ['20'], style: { bg: '#fee2e2' } });
    const engine = new Engine(wb);
    expect(engine.getValue(wb.sheets[1].id, 0, 0)).toBe(18.5);
  });
});

describe('ODS', () => {
  it('convierte fórmulas OpenFormula ↔ Excel', () => {
    expect(openFormulaToExcel('of:=SUM([.A1:.B2];[$Hoja2.C3])')).toBe('SUM(A1:B2,Hoja2!C3)');
    expect(openFormulaToExcel("of:=['Mis datos'.A1]*2")).toBe("'Mis datos'!A1*2");
    expect(excelToOpenFormula('SUM(A1:B2,Hoja2!C3)')).toBe("of:=SUM([.A1:.B2];[$'Hoja2'.C3])");
    expect(openFormulaToExcel(excelToOpenFormula('IF(A1>0,"a;b",$B$2)'))).toBe('IF(A1>0,"a;b",$B$2)');
  });
  it('ida y vuelta conserva valores, fórmulas, estilos básicos y combinaciones', async () => {
    const { blob } = await exportOds(sampleWorkbook());
    const { wb } = await importOds(await bytesOf(blob));
    expect(wb.sheets.map((s) => s.name)).toEqual(['Ventas', 'Hoja2']);
    const s = wb.sheets[0];
    expect(s.cells[cellKey(1, 3)].f).toBe('B2*C2');
    expect(s.cells[cellKey(0, 0)].v).toBe('Producto');
    expect(wb.styles[s.cells[cellKey(0, 0)].s!]).toMatchObject({ bold: true, bg: '#dcfce7' });
    expect(s.merges).toEqual([{ r1: 5, c1: 0, r2: 5, c2: 2 }]);
    expect(new Engine(wb).getValue(wb.sheets[1].id, 0, 0)).toBe(18.5);
  });
});

describe('CSV', () => {
  it('detecta separador y decimales europeos; conserva ceros a la izquierda', () => {
    const csv = 'Código;Importe;Fecha\n007;1.234,50;31/12/2025\n010;3,5;01/01/2026\n';
    const { wb, delimiter } = importCsv(new TextEncoder().encode(csv));
    expect(delimiter).toBe(';');
    const s = wb.sheets[0];
    expect(s.cells[cellKey(1, 0)].v).toBe('007');
    expect(s.cells[cellKey(1, 1)].v).toBe(1234.5);
    expect(wb.styles[s.cells[cellKey(1, 2)].s!].numFmt).toBe('dd/mm/yyyy');
  });
  it('lee Windows-1252 y exporta con comillas', async () => {
    const latin1 = new Uint8Array([0x6e, 0x6f, 0x6d, 0x62, 0x72, 0x65, 0x2c, 0x63, 0x69, 0x75, 0x64, 0x61, 0x64, 0x0a, 0x4d, 0x61, 0x72, 0xed, 0x61, 0x2c, 0x43, 0xe1, 0x64, 0x69, 0x7a, 0x0a]);
    const { wb, encoding } = importCsv(latin1);
    expect(encoding).toBe('windows-1252');
    expect(wb.sheets[0].cells[cellKey(1, 0)].v).toBe('María');
    wb.sheets[0].cells[cellKey(2, 0)] = { v: 'a,b "c"' };
    wb.sheets[0].cells[cellKey(2, 1)] = { v: 2.5, s: internStyle(wb, {}) || undefined };
    const out = await (await exportCsv(wb, wb.sheets[0], { delimiter: ',', bom: false })).text();
    expect(out.split('\r\n')[2]).toBe('"a,b ""c""",2.5');
  });
});
