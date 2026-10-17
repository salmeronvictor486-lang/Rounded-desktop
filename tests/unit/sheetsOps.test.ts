import { beforeAll, describe, expect, it } from 'vitest';
import { SheetController } from '@/modules/sheets/controller';
import { createWorkbook, cellKey } from '@/modules/sheets/model';
import { changeStructure, renameSheet, addSheet, mergeCells } from '@/modules/sheets/ops/structure';
import { sortRange, setFilter, setFilterHidden, hiddenRows } from '@/modules/sheets/ops/sortFilter';
import { fillRange } from '@/modules/sheets/ops/fill';
import { copyRange, pasteAt, parseHtmlTable } from '@/modules/sheets/ops/clipboard';
import { findAll, replaceIn } from '@/modules/sheets/ops/find';
import { setLocale } from '@/modules/sheets/format/locale';
import { isError } from '@/modules/sheets/engine/values';

beforeAll(() => setLocale('es'));

const v = (ctl: SheetController, r: number, c: number) => {
  const x = ctl.value(r, c);
  return isError(x) ? x.code : x;
};

function make(): SheetController {
  return new SheetController(createWorkbook());
}

describe('Controlador de hojas', () => {
  it('escritura, deshacer y rehacer', () => {
    const ctl = make();
    ctl.setCellInput(0, 0, '5');
    ctl.setCellInput(1, 0, '=A1*3');
    expect(v(ctl, 1, 0)).toBe(15);
    ctl.setCellInput(0, 0, '7');
    expect(v(ctl, 1, 0)).toBe(21);
    ctl.undo();
    expect(v(ctl, 1, 0)).toBe(15);
    ctl.redo();
    expect(v(ctl, 1, 0)).toBe(21);
  });

  it('interpreta porcentajes, monedas y fechas al escribir y aplica formato', () => {
    const ctl = make();
    ctl.setCellInput(0, 0, '25%');
    expect(ctl.value(0, 0)).toBeCloseTo(0.25);
    expect(ctl.styleOf(ctl.getCell(0, 0)).numFmt).toBe('0%');
    ctl.setCellInput(1, 0, '15/08/2025');
    expect(ctl.styleOf(ctl.getCell(1, 0)).numFmt).toBe('dd/mm/yyyy');
    expect(ctl.rawInput(1, 0)).toBe('15/08/2025');
  });

  it('insertar y eliminar filas/columnas ajusta fórmulas de todas las hojas', () => {
    const ctl = make();
    addSheet(ctl);
    ctl.setActiveSheet(0);
    ctl.setCellInput(0, 0, '1');
    ctl.setCellInput(1, 0, '2');
    ctl.setCellInput(2, 0, '=SUM(A1:A2)');
    ctl.wb.sheets[1].cells[cellKey(0, 0)] = { f: 'Hoja1!A3*10' };
    ctl.engine.rebuild();
    changeStructure(ctl, 'row', 1, 1);
    expect(ctl.getCell(3, 0)?.f).toBe('SUM(A1:A3)');
    expect(ctl.wb.sheets[1].cells[cellKey(0, 0)].f).toBe('Hoja1!A4*10');
    expect(v(ctl, 3, 0)).toBe(3);
    changeStructure(ctl, 'col', 0, 1);
    expect(ctl.getCell(3, 1)?.f).toBe('SUM(B1:B3)');
    changeStructure(ctl, 'row', 0, -1);
    expect(ctl.getCell(2, 1)?.f).toBe('SUM(B1:B2)');
    ctl.undo();
    expect(ctl.getCell(3, 1)?.f).toBe('SUM(B1:B3)');
  });

  it('renombrar una hoja actualiza las referencias', () => {
    const ctl = make();
    addSheet(ctl);
    ctl.wb.sheets[1].cells[cellKey(0, 0)] = { f: 'Hoja1!B2+1' };
    expect(renameSheet(ctl, 0, 'Datos 2025')).toBeNull();
    expect(ctl.wb.sheets[1].cells[cellKey(0, 0)].f).toBe("'Datos 2025'!B2+1");
    expect(renameSheet(ctl, 1, 'Datos 2025')).toMatch(/Ya existe/);
  });

  it('ordena con encabezado y conserva las fórmulas relativas', () => {
    const ctl = make();
    [['Nombre', 'Edad'], ['Luis', '40'], ['Ana', '25'], ['Marta', '33']].forEach((row, r) => row.forEach((x, c) => ctl.setCellInput(r, c, x)));
    sortRange(ctl, { r1: 0, c1: 0, r2: 3, c2: 1 }, [{ col: 1, asc: true }], true);
    expect([v(ctl, 1, 0), v(ctl, 2, 0), v(ctl, 3, 0)]).toEqual(['Ana', 'Marta', 'Luis']);
    sortRange(ctl, { r1: 0, c1: 0, r2: 3, c2: 1 }, [{ col: 0, asc: false }], true);
    expect(v(ctl, 1, 0)).toBe('Marta');
  });

  it('filtros: oculta filas por valor', () => {
    const ctl = make();
    [['Fruta'], ['pera'], ['manzana'], ['pera']].forEach((row, r) => ctl.setCellInput(r, 0, row[0]));
    setFilter(ctl, { r1: 0, c1: 0, r2: 3, c2: 0 });
    setFilterHidden(ctl, 0, ['pera']);
    expect(Array.from(hiddenRows(ctl, ctl.sheet)).sort()).toEqual([1, 3]);
  });

  it('relleno: series numéricas, texto numerado y fórmulas', () => {
    const ctl = make();
    ctl.setCellInput(0, 0, '2');
    ctl.setCellInput(1, 0, '4');
    ctl.setCellInput(0, 1, 'Semana 1');
    ctl.setCellInput(0, 2, '=A1*10');
    fillRange(ctl, { r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 0, r2: 4, c2: 0 });
    expect([v(ctl, 2, 0), v(ctl, 3, 0), v(ctl, 4, 0)]).toEqual([6, 8, 10]);
    fillRange(ctl, { r1: 0, c1: 1, r2: 0, c2: 2 }, { r1: 0, c1: 1, r2: 2, c2: 2 });
    expect(v(ctl, 2, 1)).toBe('Semana 3');
    expect(ctl.getCell(2, 2)?.f).toBe('A3*10');
    expect(v(ctl, 2, 2)).toBe(60);
  });

  it('copiar y pegar desplaza referencias; pegar tablas HTML externas', () => {
    const ctl = make();
    ctl.setCellInput(0, 0, '3');
    ctl.setCellInput(0, 1, '=A1+1');
    ctl.selectRange({ r1: 0, c1: 0, r2: 0, c2: 1 });
    const p = copyRange(ctl, ctl.sel.range);
    ctl.select(5, 0);
    pasteAt(ctl, { r: 5, c: 0 }, p.tsv, null);
    expect(ctl.getCell(5, 1)?.f).toBe('A6+1');
    expect(v(ctl, 5, 1)).toBe(4);
    expect(parseHtmlTable('<table><tr><td>a</td><td colspan="2">b</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>')).toEqual([['a', 'b', ''], ['1', '2', '3']]);
  });

  it('combinar celdas conserva solo la superior izquierda', () => {
    const ctl = make();
    ctl.setCellInput(0, 0, 'A');
    ctl.setCellInput(0, 1, 'B');
    mergeCells(ctl, { r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(ctl.sheet.merges).toHaveLength(1);
    expect(ctl.getCell(0, 1)).toBeUndefined();
    ctl.select(1, 1);
    expect(ctl.sel.range).toEqual({ r1: 0, c1: 0, r2: 1, c2: 1 });
  });

  it('buscar y reemplazar en valores y fórmulas', () => {
    const ctl = make();
    ctl.setCellInput(0, 0, 'hola mundo');
    ctl.setCellInput(1, 0, '=A1&"!"');
    const opts = { matchCase: false, wholeCell: false, inFormulas: false, allSheets: false };
    expect(findAll(ctl, 'mundo', opts)).toHaveLength(2);
    replaceIn(ctl, findAll(ctl, 'mundo', opts).slice(0, 1), 'mundo', 'equipo', opts);
    expect(v(ctl, 1, 0)).toBe('hola equipo!');
  });

  it('validación de datos con lista y rango numérico', () => {
    const ctl = make();
    ctl.sheet.validations.push({ id: 'x', range: { r1: 0, c1: 0, r2: 9, c2: 0 }, type: 'list', values: ['Sí', 'No'], allowBlank: true, strict: true });
    ctl.sheet.validations.push({ id: 'y', range: { r1: 0, c1: 1, r2: 9, c2: 1 }, type: 'integer', values: ['1', '10'], allowBlank: true, strict: true });
    expect(ctl.validate(0, 0, 'sí')).toBeNull();
    expect(ctl.validate(0, 0, 'Quizá')?.strict).toBe(true);
    expect(ctl.validate(0, 1, '5')).toBeNull();
    expect(ctl.validate(0, 1, '11')).not.toBeNull();
    expect(ctl.validate(0, 1, '2,5')).not.toBeNull();
  });
});
