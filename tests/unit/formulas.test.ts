import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '@/modules/sheets/engine/engine';
import { createWorkbook, cellKey, type Workbook } from '@/modules/sheets/model';
import { adjustFormulaForStructure, parseFormula, shiftFormula } from '@/modules/sheets/engine/parser';
import { isError } from '@/modules/sheets/engine/values';
import { dateToSerial } from '@/modules/sheets/engine/dates';
import { setLocale } from '@/modules/sheets/format/locale';

function wbWith(cells: Record<string, string | number | boolean>, extraSheets: Record<string, Record<string, string | number>> = {}): Workbook {
  const wb = createWorkbook(['Hoja1', ...Object.keys(extraSheets)]);
  const put = (sheetIdx: number, map: Record<string, string | number | boolean>) => {
    for (const [a1, v] of Object.entries(map)) {
      const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
      const c = m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const r = Number(m[2]) - 1;
      wb.sheets[sheetIdx].cells[cellKey(r, c)] = typeof v === 'string' && v.startsWith('=') ? { f: v.slice(1) } : { v };
    }
  };
  put(0, cells);
  Object.values(extraSheets).forEach((m, i) => put(i + 1, m));
  return wb;
}

function val(e: Engine, a1: string, sheet = 0) {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
  const c = m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const v = e.getValue(e.workbook.sheets[sheet].id, Number(m[2]) - 1, c);
  return isError(v) ? v.code : v;
}

beforeAll(() => setLocale('es'));

describe('Analizador', () => {
  it('respeta la precedencia de operadores como Excel', () => {
    const e = new Engine(wbWith({ A1: '=1+2*3', A2: '=-2^2', A3: '=2^3^2', A4: '=10%+1', A5: '="a"&1+1', A6: '=1<2=TRUE' }));
    expect(val(e, 'A1')).toBe(7);
    expect(val(e, 'A2')).toBe(4);
    expect(val(e, 'A3')).toBe(64);
    expect(val(e, 'A4')).toBeCloseTo(1.1);
    expect(val(e, 'A5')).toBe('a2');
    expect(val(e, 'A6')).toBe(true);
  });
  it('acepta punto y coma como separador y nombres de función en español', () => {
    const e = new Engine(wbWith({ A1: 1, A2: 2, A3: '=SUMA(A1:A2;10)', A4: '=SI(A1>0;"sí";"no")', A5: '=promedio(A1:A2)' }));
    expect(val(e, 'A3')).toBe(13);
    expect(val(e, 'A4')).toBe('sí');
    expect(val(e, 'A5')).toBe(1.5);
  });
  it('detecta errores de sintaxis', () => {
    expect(() => parseFormula('SUM(1,')).toThrow();
    const e = new Engine(wbWith({ A1: '=SUM(1,' }));
    expect(val(e, 'A1')).toBe('#NAME?');
  });
});

describe('Referencias y dependencias', () => {
  it('recalcula de forma incremental al cambiar una celda', () => {
    const wb = wbWith({ A1: 5, B1: '=A1*2', C1: '=B1+A1', D1: '=SUM(A1:C1)' });
    const e = new Engine(wb);
    expect(val(e, 'D1')).toBe(5 + 10 + 15);
    wb.sheets[0].cells[cellKey(0, 0)] = { v: 10 };
    e.cellChanged(wb.sheets[0].id, 0, 0);
    expect(val(e, 'B1')).toBe(20);
    expect(val(e, 'C1')).toBe(30);
    expect(val(e, 'D1')).toBe(60);
  });
  it('referencias entre hojas, incluidas con espacios', () => {
    const e = new Engine(wbWith({ A1: "='Mis datos'!B2*2", A2: '=SUM(Datos2!A1:A3)' }, { 'Mis datos': { B2: 21 }, Datos2: { A1: 1, A2: 2, A3: 3 } }));
    expect(val(e, 'A1')).toBe(42);
    expect(val(e, 'A2')).toBe(6);
  });
  it('detecta referencias circulares', () => {
    const e = new Engine(wbWith({ A1: '=B1+1', B1: '=A1+1', C1: '=C1' }));
    expect(val(e, 'A1')).toBe('#CIRC!');
    expect(val(e, 'C1')).toBe('#CIRC!');
  });
  it('cadenas largas de dependencias sin desbordar la pila', () => {
    const cells: Record<string, string | number> = { A1: 1 };
    for (let i = 2; i <= 20000; i++) cells[`A${i}`] = `=A${i - 1}+1`;
    const e = new Engine(wbWith(cells));
    expect(val(e, 'A20000')).toBe(20000);
  });
  it('desplaza referencias relativas, absolutas y mixtas', () => {
    expect(shiftFormula('A1+$B$2+C$3+$D4', 2, 1)).toBe('B3+$B$2+D$3+$D6');
    expect(shiftFormula('SUM(A1:B2)', 1, 0)).toBe('SUM(A2:B3)');
    expect(shiftFormula('A1', -1, 0)).toBe('#REF!');
    expect(shiftFormula("'Mi hoja'!A1*2", 1, 1)).toBe("'Mi hoja'!B2*2");
  });
  it('ajusta referencias al insertar y eliminar filas', () => {
    const ins = { sheetName: 'Hoja1', axis: 'row' as const, index: 1, count: 2 };
    expect(adjustFormulaForStructure('A1+A2+SUM(A1:A5)', 'Hoja1', ins)).toBe('A1+A4+SUM(A1:A7)');
    const del = { sheetName: 'Hoja1', axis: 'row' as const, index: 1, count: -1 };
    expect(adjustFormulaForStructure('A1+A2+A3+SUM(A1:A5)', 'Hoja1', del)).toBe('A1+#REF!+A2+SUM(A1:A4)');
    expect(adjustFormulaForStructure('Otra!A3', 'Hoja1', del)).toBe('Otra!A3');
  });
});

describe('Funciones', () => {
  const e = new Engine(
    wbWith({
      A1: 10, A2: 20, A3: 30, A4: 'texto', A5: true,
      B1: 'manzana', B2: 'pera', B3: 'manzana',
      C1: 1, C2: 2, C3: 3,
      D1: '=SUM(A1:A5)', D2: '=AVERAGE(A1:A5)', D3: '=COUNT(A1:A5)', D4: '=COUNTA(A1:A5)', D5: '=MAX(A1:A3)-MIN(A1:A3)',
      D6: '=SUMIF(B1:B3,"manzana",C1:C3)', D7: '=COUNTIF(A1:A3,">15")', D8: '=VLOOKUP("pera",B1:C3,2,FALSE)',
      D9: '=IF(AND(A1>5,OR(A2<0,A3=30)),"ok","no")', D10: '=IFERROR(1/0,"div")', D11: '=INDEX(A1:C3,2,3)', D12: '=MATCH(30,A1:A3,0)',
      D13: '=ROUND(2.675,2)', D14: '=LEFT("Rounded",5)&UPPER(MID("grid",1,1))', D15: '=SUMPRODUCT(A1:A3,C1:C3)', D16: '=XLOOKUP("pera",B1:B3,A1:A3)',
      D17: '=TEXTJOIN("-",TRUE,B1:B3)', D18: '=COUNTIFS(B1:B3,"manzana",C1:C3,">1")', D19: '=1/0', D20: '=NOEXISTE(1)',
      D21: '=AVERAGEIF(A1:A3,">10")', D22: '=MEDIAN(A1:A3,100)', D23: '=PMT(0.05/12,360,200000)', D24: '=SUBSTITUTE("a-b-c","-","+")',
      D25: '=DATE(2025,1,31)', D26: '=EOMONTH(DATE(2025,1,15),1)', D27: '=YEAR(D25)&"-"&MONTH(D25)', D28: '=DATEDIF(DATE(2020,5,10),DATE(2025,5,9),"Y")',
      D29: '=WEEKDAY(DATE(2025,10,17))', D30: '=TEXT(0.256,"0.0%")', D31: '=COUNTIF(B1:B3,"man*")', D32: '=SUM({1,2;3,4})', D33: '=STDEV(A1:A3)',
      D34: '=VLOOKUP(25,A1:A3,1,TRUE)', D35: '=NETWORKDAYS(DATE(2025,10,13),DATE(2025,10,24))',
    }),
  );
  it.each([
    ['D1', 60], ['D2', 20], ['D3', 3], ['D4', 5], ['D5', 20], ['D6', 4], ['D7', 2], ['D8', 2], ['D9', 'ok'], ['D10', 'div'], ['D11', 2],
    ['D12', 3], ['D13', 2.68], ['D14', 'RoundG'], ['D15', 140], ['D16', 20], ['D17', 'manzana-pera-manzana'], ['D18', 1], ['D19', '#DIV/0!'],
    ['D20', '#NAME?'], ['D21', 25], ['D22', 25], ['D24', 'a+b+c'], ['D25', dateToSerial(2025, 1, 31)], ['D26', dateToSerial(2025, 2, 28)],
    ['D27', '2025-1'], ['D28', 4], ['D29', 6], ['D30', '25,6%'], ['D31', 2], ['D32', 10], ['D34', 20], ['D35', 10],
  ])('%s = %s', (cell, expected) => {
    expect(val(e, cell)).toEqual(expected);
  });
  it('funciones financieras y estadísticas', () => {
    expect(val(e, 'D23') as number).toBeCloseTo(-1073.64, 2);
    expect(val(e, 'D33') as number).toBeCloseTo(10, 6);
  });
});
