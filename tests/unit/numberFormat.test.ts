import { beforeAll, describe, expect, it } from 'vitest';
import { formatValue } from '@/modules/sheets/format/numberFormat';
import { parseInput } from '@/modules/sheets/format/parseInput';
import { setLocale } from '@/modules/sheets/format/locale';
import { dateToSerial } from '@/modules/sheets/engine/dates';

beforeAll(() => setLocale('es'));

describe('Formatos numéricos', () => {
  it.each([
    [1234.567, 'General', '1234,567'],
    [1234.567, '#,##0.00', '1.234,57'],
    [1234.5, '#,##0', '1.235'],
    [0.256, '0.0%', '25,6%'],
    [-1234.5, '#,##0.00 "€";[Red]-#,##0.00 "€"', '-1.234,50 €'],
    [1234.5, '"$"#,##0.00', '$1.234,50'],
    [12345.678, '0.00E+00', '1,23E+04'],
    [0.5, '0.###', '0,5'],
    [5, '000', '005'],
    [dateToSerial(2025, 12, 31), 'dd/mm/yyyy', '31/12/2025'],
    [dateToSerial(2025, 3, 5), 'd "de" mmmm "de" yyyy', '5 de marzo de 2025'],
    [dateToSerial(2025, 3, 5, 14, 7), 'dd/mm/yyyy hh:mm', '05/03/2025 14:07'],
    [1.5, '[h]:mm', '36:00'],
    [dateToSerial(2025, 3, 5, 14, 7), 'h:mm AM/PM', '2:07 PM'],
    [dateToSerial(2025, 10, 17), 'dddd', 'viernes'],
  ])('%s con «%s» → %s', (v, fmt, expected) => {
    expect(formatValue(v, fmt).text).toBe(expected);
  });
  it('color de sección', () => {
    expect(formatValue(-1, '0;[Red]-0').color).toBe('#dc2626');
  });
});

describe('Interpretación de lo escrito', () => {
  it.each([
    ['42', 42, undefined],
    ['3,5', 3.5, undefined],
    ['1.234,5', 1234.5, '#,##0.00'],
    ['15%', 0.15, '0%'],
    ['12,5 %', 0.125, '0.0%'],
    ['12,50 €', 12.5, '#,##0.00 "€"'],
    ['VERDADERO', true, undefined],
    ["'0123", '0123', undefined],
    ['31/12/2025', dateToSerial(2025, 12, 31), 'dd/mm/yyyy'],
    ['2025-01-02', dateToSerial(2025, 1, 2), 'yyyy-mm-dd'],
    ['14:30', 14.5 / 24, 'hh:mm'],
    ['hola', 'hola', undefined],
  ])('«%s»', (raw, value, format) => {
    const r = parseInput(raw);
    if (typeof value === 'number') expect(r.value as number).toBeCloseTo(value, 9);
    else expect(r.value).toBe(value);
    expect(r.format).toBe(format);
  });
});
