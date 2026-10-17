import { parseRangeRef } from '../engine/address';
import { parseInput } from '../format/parseInput';
import type { ValidationRule } from '../model';
import type { SheetController } from '../controller';

/** Valores de una regla de lista (literales o de un rango). */
export function listOptions(rule: ValidationRule, ctl: SheetController): string[] {
  if (rule.source) {
    const ref = parseRangeRef(rule.source);
    if (!ref) return [];
    const sheet = ref.sheet ? ctl.engine.sheetByName(ref.sheet) : ctl.sheet;
    if (!sheet) return [];
    const out: string[] = [];
    const { r1, c1, r2, c2 } = ref.range;
    for (let r = r1; r <= Math.min(r2, r1 + 1000); r++)
      for (let c = c1; c <= Math.min(c2, c1 + 50); c++) {
        const v = ctl.engine.getValue(sheet.id, r, c);
        if (v !== null && v !== '') out.push(String(v));
      }
    return Array.from(new Set(out));
  }
  return rule.values.filter((v) => v !== '');
}

/** Devuelve un mensaje si el valor no cumple la regla. */
export function validateValue(rule: ValidationRule, input: string, ctl: SheetController): string | null {
  if (input.trim() === '') return rule.allowBlank ? null : rule.message || 'La celda no puede quedar vacía.';
  if (input.startsWith('=')) return null; // Las fórmulas no se validan al escribir
  const parsed = parseInput(input);
  const [minS, maxS] = rule.values;
  const min = minS !== undefined && minS !== '' ? parseInput(minS).value : null;
  const max = maxS !== undefined && maxS !== '' ? parseInput(maxS).value : null;
  const inRange = (n: number) => (typeof min !== 'number' || n >= min) && (typeof max !== 'number' || n <= max);
  switch (rule.type) {
    case 'list': {
      const opts = listOptions(rule, ctl);
      return opts.some((o) => o.toLowerCase() === input.trim().toLowerCase()) ? null : rule.message || `Elige un valor de la lista: ${opts.slice(0, 8).join(', ')}${opts.length > 8 ? '…' : ''}`;
    }
    case 'number':
    case 'integer':
    case 'date': {
      const v = parsed.value;
      if (typeof v !== 'number') return rule.message || (rule.type === 'date' ? 'Introduce una fecha válida.' : 'Introduce un número.');
      if (rule.type === 'integer' && !Number.isInteger(v)) return rule.message || 'Introduce un número entero.';
      if (!inRange(v)) return rule.message || `El valor debe estar entre ${minS || '−∞'} y ${maxS || '∞'}.`;
      return null;
    }
    case 'textLength': {
      const len = input.length;
      return inRange(len) ? null : rule.message || `La longitud del texto debe estar entre ${minS || 0} y ${maxS || '∞'} caracteres.`;
    }
  }
  return null;
}
