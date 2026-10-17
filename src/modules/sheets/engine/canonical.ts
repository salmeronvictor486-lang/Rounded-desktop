import { tokenize } from './parser';
import { resolveFunction } from './functions';

/**
 * Normaliza una fórmula escrita por el usuario: nombres de función en inglés
 * (SUMA → SUM) y «;» como separador → «,». Así se guarda en el formato que
 * esperan XLSX y ODS.
 */
export function canonicalizeFormula(formula: string): string {
  let tokens;
  try {
    tokens = tokenize(formula);
  } catch {
    return formula;
  }
  // Fuera de matrices literales, «;» es separador de argumentos.
  let depthBrace = 0;
  let out = '';
  tokens.forEach((t, i) => {
    if (t.t === 'lb') depthBrace++;
    if (t.t === 'rb') depthBrace--;
    if (t.t === 'semi' && depthBrace === 0) {
      out += ',';
      return;
    }
    if (t.t === 'name') {
      const nextTok = tokens.slice(i + 1).find((x) => x.t !== 'ws');
      if (nextTok?.t === 'lp') {
        const fn = resolveFunction(t.v);
        out += fn ? fn.canonical : t.text.toUpperCase();
        return;
      }
    }
    if (t.t === 'bool') {
      out += t.v ? 'TRUE' : 'FALSE';
      return;
    }
    out += t.text;
  });
  return out;
}
