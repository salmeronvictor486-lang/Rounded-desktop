import { colToLetters, lettersToCol, quoteSheet } from './address';
import { FormulaError, parseErrorCode } from './values';

// ============ Tokenizador ============

export interface RefPart {
  row: number | null;
  col: number | null;
  absRow: boolean;
  absCol: boolean;
}

export type Token =
  | { t: 'num'; v: number; text: string; pos: number }
  | { t: 'str'; v: string; text: string; pos: number }
  | { t: 'bool'; v: boolean; text: string; pos: number }
  | { t: 'err'; v: FormulaError; text: string; pos: number }
  | { t: 'ref'; sheet?: string; a: RefPart; b?: RefPart; text: string; pos: number }
  | { t: 'name'; v: string; text: string; pos: number }
  | { t: 'op'; v: string; text: string; pos: number }
  | { t: 'lp' | 'rp' | 'sep' | 'lb' | 'rb' | 'semi'; text: string; pos: number }
  | { t: 'ws'; text: string; pos: number };

export class ParseError extends Error {}

const CELL_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/;
const COL_RE = /^(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/;
const ROW_RE = /^(\$?)(\d{1,7})/;

function parseRefPart(s: string): { part: RefPart; len: number } | null {
  let m = CELL_RE.exec(s);
  if (m) {
    const row = Number(m[4]) - 1;
    const col = lettersToCol(m[2]);
    if (row < 0 || col > 16383 || row > 1048575) return null;
    return { part: { row, col, absRow: !!m[3], absCol: !!m[1] }, len: m[0].length };
  }
  return null;
}

/** Intenta leer una referencia (A1, A1:B2, A:A, 1:1) al principio de `s`. */
function readRef(s: string): { a: RefPart; b?: RefPart; len: number } | null {
  const first = parseRefPart(s);
  if (first) {
    const rest = s.slice(first.len);
    // Una referencia no puede ir seguida de letras/números ni de "(" (sería un nombre de función como LOG10()).
    if (/^[A-Za-z0-9_.(]/.test(rest)) return null;
    if (rest.startsWith(':')) {
      const second = parseRefPart(rest.slice(1));
      if (second && !/^[A-Za-z0-9_(]/.test(rest.slice(1 + second.len))) return { a: first.part, b: second.part, len: first.len + 1 + second.len };
    }
    return { a: first.part, len: first.len };
  }
  // Columnas completas A:C
  const c1 = COL_RE.exec(s);
  if (c1 && s[c1[0].length] === ':') {
    const c2 = COL_RE.exec(s.slice(c1[0].length + 1));
    if (c2) {
      return {
        a: { row: null, col: lettersToCol(c1[2]), absRow: false, absCol: !!c1[1] },
        b: { row: null, col: lettersToCol(c2[2]), absRow: false, absCol: !!c2[1] },
        len: c1[0].length + 1 + c2[0].length,
      };
    }
  }
  // Filas completas 1:3
  const r1 = ROW_RE.exec(s);
  if (r1 && s[r1[0].length] === ':') {
    const r2 = ROW_RE.exec(s.slice(r1[0].length + 1));
    if (r2 && !/^[A-Za-z0-9_.]/.test(s.slice(r1[0].length + 1 + r2[0].length))) {
      return {
        a: { row: Number(r1[2]) - 1, col: null, absRow: !!r1[1], absCol: false },
        b: { row: Number(r2[2]) - 1, col: null, absRow: !!r2[1], absCol: false },
        len: r1[0].length + 1 + r2[0].length,
      };
    }
  }
  return null;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    if (/\s/.test(ch)) {
      const m = /^\s+/.exec(rest)!;
      tokens.push({ t: 'ws', text: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let v = '';
      for (;;) {
        if (j >= src.length) throw new ParseError('Falta cerrar las comillas');
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            v += '"';
            j += 2;
            continue;
          }
          break;
        }
        v += src[j++];
      }
      tokens.push({ t: 'str', v, text: src.slice(i, j + 1), pos: i });
      i = j + 1;
      continue;
    }
    if (ch === '#') {
      const m = /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|CIRC!|SPILL!)/i.exec(rest);
      if (!m) throw new ParseError('Error no reconocido');
      tokens.push({ t: 'err', v: parseErrorCode(m[0])!, text: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    // Hoja entre comillas: 'Mi hoja'!A1
    if (ch === "'") {
      let j = i + 1;
      let name = '';
      for (;;) {
        if (j >= src.length) throw new ParseError('Falta cerrar el nombre de la hoja');
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            name += "'";
            j += 2;
            continue;
          }
          break;
        }
        name += src[j++];
      }
      if (src[j + 1] !== '!') throw new ParseError('Se esperaba «!» tras el nombre de la hoja');
      const ref = readRef(src.slice(j + 2));
      if (!ref) {
        if (/^#REF!/i.test(src.slice(j + 2))) {
          tokens.push({ t: 'err', v: parseErrorCode('#REF!')!, text: src.slice(i, j + 7), pos: i });
          i = j + 7;
          continue;
        }
        throw new ParseError('Referencia no válida');
      }
      tokens.push({ t: 'ref', sheet: name, a: ref.a, b: ref.b, text: src.slice(i, j + 2 + ref.len), pos: i });
      i = j + 2 + ref.len;
      continue;
    }
    const num = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(rest);
    if (num && !/^\d+:\d/.test(rest)) {
      // No confundir con referencias a filas (1:3)
      tokens.push({ t: 'num', v: Number(num[0]), text: num[0], pos: i });
      i += num[0].length;
      continue;
    }
    // Identificador: puede ser hoja (Hoja1!A1), referencia, booleano o función.
    const ident = /^[A-Za-z_À-ɏ\\][A-Za-z0-9_.À-ɏ]*/.exec(rest);
    if (ident && rest[ident[0].length] === '!') {
      const ref = readRef(rest.slice(ident[0].length + 1));
      if (ref) {
        tokens.push({ t: 'ref', sheet: ident[0], a: ref.a, b: ref.b, text: rest.slice(0, ident[0].length + 1 + ref.len), pos: i });
        i += ident[0].length + 1 + ref.len;
        continue;
      }
      if (/^#REF!/i.test(rest.slice(ident[0].length + 1))) {
        const len = ident[0].length + 6;
        tokens.push({ t: 'err', v: parseErrorCode('#REF!')!, text: rest.slice(0, len), pos: i });
        i += len;
        continue;
      }
    }
    const ref = /^[$A-Za-z0-9]/.test(ch) ? readRef(rest) : null;
    if (ref) {
      tokens.push({ t: 'ref', a: ref.a, b: ref.b, text: rest.slice(0, ref.len), pos: i });
      i += ref.len;
      continue;
    }
    if (ident) {
      const up = ident[0].toUpperCase();
      if ((up === 'TRUE' || up === 'VERDADERO') && rest[ident[0].length] !== '(') tokens.push({ t: 'bool', v: true, text: ident[0], pos: i });
      else if ((up === 'FALSE' || up === 'FALSO') && rest[ident[0].length] !== '(') tokens.push({ t: 'bool', v: false, text: ident[0], pos: i });
      else tokens.push({ t: 'name', v: ident[0], text: ident[0], pos: i });
      i += ident[0].length;
      continue;
    }
    const op2 = rest.slice(0, 2);
    if (op2 === '<=' || op2 === '>=' || op2 === '<>') {
      tokens.push({ t: 'op', v: op2, text: op2, pos: i });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(ch)) {
      tokens.push({ t: 'op', v: ch, text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '(') tokens.push({ t: 'lp', text: ch, pos: i });
    else if (ch === ')') tokens.push({ t: 'rp', text: ch, pos: i });
    else if (ch === ',') tokens.push({ t: 'sep', text: ch, pos: i });
    else if (ch === ';') tokens.push({ t: 'semi', text: ch, pos: i });
    else if (ch === '{') tokens.push({ t: 'lb', text: ch, pos: i });
    else if (ch === '}') tokens.push({ t: 'rb', text: ch, pos: i });
    else throw new ParseError(`Carácter inesperado «${ch}»`);
    i++;
  }
  return tokens;
}

// ============ Árbol sintáctico ============

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: FormulaError }
  | { k: 'ref'; sheet?: string; row: number; col: number }
  | { k: 'range'; sheet?: string; r1: number; c1: number; r2: number; c2: number; wholeCol?: boolean; wholeRow?: boolean }
  | { k: 'func'; name: string; args: Node[] }
  | { k: 'un'; op: string; arg: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'pct'; arg: Node }
  | { k: 'arr'; rows: Node[][] }
  | { k: 'name'; name: string };

export const EMPTY_ARG: Node = { k: 'name', name: '__EMPTY__' };

const BIN_PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

/** Analiza una fórmula (sin "="). Acepta «;» como separador de argumentos. */
export function parseFormula(src: string): Node {
  const tokens = tokenize(src).filter((t) => t.t !== 'ws');
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isSep = (t: Token | undefined) => !!t && (t.t === 'sep' || t.t === 'semi');

  const primary = (): Node => {
    const t = next();
    if (!t) throw new ParseError('Fórmula incompleta');
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v };
      case 'str':
        return { k: 'str', v: t.v };
      case 'bool':
        return { k: 'bool', v: t.v };
      case 'err':
        return { k: 'err', v: t.v };
      case 'ref': {
        if (!t.b) {
          if (t.a.row === null || t.a.col === null) throw new ParseError('Referencia incompleta');
          return { k: 'ref', sheet: t.sheet, row: t.a.row, col: t.a.col };
        }
        const wholeCol = t.a.row === null;
        const wholeRow = t.a.col === null;
        const r1 = t.a.row ?? 0;
        const r2 = t.b.row ?? 1_048_575;
        const c1 = t.a.col ?? 0;
        const c2 = t.b.col ?? 16_383;
        return { k: 'range', sheet: t.sheet, r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2), wholeCol, wholeRow };
      }
      case 'name': {
        if (peek()?.t === 'lp') {
          next();
          const args: Node[] = [];
          if (peek()?.t !== 'rp') {
            for (;;) {
              // Argumento vacío: f(a,,b) o f(a,)
              if (isSep(peek()) || peek()?.t === 'rp') args.push(EMPTY_ARG);
              else args.push(expr(0));
              if (isSep(peek())) {
                next();
                continue;
              }
              break;
            }
          }
          if (next()?.t !== 'rp') throw new ParseError('Falta cerrar el paréntesis');
          return { k: 'func', name: t.v.toUpperCase(), args };
        }
        return { k: 'name', name: t.v };
      }
      case 'lp': {
        const e = expr(0);
        if (next()?.t !== 'rp') throw new ParseError('Falta cerrar el paréntesis');
        return e;
      }
      case 'lb': {
        const rows: Node[][] = [[]];
        for (;;) {
          rows[rows.length - 1].push(expr(0));
          const s = next();
          if (!s) throw new ParseError('Matriz sin cerrar');
          if (s.t === 'rb') break;
          if (s.t === 'semi') rows.push([]);
          else if (s.t !== 'sep') throw new ParseError('Matriz no válida');
        }
        return { k: 'arr', rows };
      }
      case 'op':
        if (t.v === '-' || t.v === '+') return { k: 'un', op: t.v, arg: unaryOperand() };
        throw new ParseError(`Operador inesperado «${t.v}»`);
      default:
        throw new ParseError('Fórmula no válida');
    }
  };

  // El signo negativo tiene mayor precedencia que ^ (como en Excel: -2^2 = 4)
  const unaryOperand = (): Node => postfix(primary());

  const postfix = (n: Node): Node => {
    while (peek()?.t === 'op' && (peek() as any).v === '%') {
      next();
      n = { k: 'pct', arg: n };
    }
    return n;
  };

  const expr = (minPrec: number): Node => {
    let left = postfix(primary());
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op') break;
      const prec = BIN_PREC[t.v];
      if (prec === undefined || prec < minPrec) break;
      next();
      // ^ es asociativo por la izquierda en Excel
      const right = expr(prec + 1);
      left = { k: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  };

  const tree = expr(0);
  if (p < tokens.length) throw new ParseError(`Sobra «${tokens[p].text}»`);
  return tree;
}

// ============ Reescritura de referencias ============

export function refPartText(p: RefPart): string {
  return `${p.col !== null ? `${p.absCol ? '$' : ''}${colToLetters(p.col)}` : ''}${p.row !== null ? `${p.absRow ? '$' : ''}${p.row + 1}` : ''}`;
}

export function refTokenText(sheet: string | undefined, a: RefPart, b?: RefPart): string {
  const prefix = sheet !== undefined ? `${quoteSheet(sheet)}!` : '';
  return prefix + refPartText(a) + (b ? `:${refPartText(b)}` : '');
}

/**
 * Recorre los tokens de referencia y permite sustituirlos. `fn` devuelve el
 * nuevo texto, o null para dejarlo igual. Conserva el resto del texto tal cual.
 */
export function rewriteFormula(formula: string, fn: (tok: Extract<Token, { t: 'ref' }>) => string | null, nameFn?: (tok: Extract<Token, { t: 'name' }>, isFunc: boolean) => string | null): string {
  let tokens: Token[];
  try {
    tokens = tokenize(formula);
  } catch {
    return formula;
  }
  let out = '';
  tokens.forEach((t, i) => {
    if (t.t === 'ref') out += fn(t) ?? t.text;
    else if (t.t === 'name' && nameFn) {
      const nextTok = tokens.slice(i + 1).find((x) => x.t !== 'ws');
      out += nameFn(t, nextTok?.t === 'lp') ?? t.text;
    } else out += t.text;
  });
  return out;
}

/** Desplaza las referencias relativas (copiar/pegar, rellenar). */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  return rewriteFormula(formula, (tok) => {
    const move = (p: RefPart): RefPart | null => {
      const row = p.row === null ? null : p.absRow ? p.row : p.row + dRow;
      const col = p.col === null ? null : p.absCol ? p.col : p.col + dCol;
      if ((row !== null && (row < 0 || row > 1_048_575)) || (col !== null && (col < 0 || col > 16_383))) return null;
      return { ...p, row, col };
    };
    const a = move(tok.a);
    const b = tok.b ? move(tok.b) : undefined;
    if (!a || b === null) return `${tok.sheet !== undefined ? `${quoteSheet(tok.sheet)}!` : ''}#REF!`;
    return refTokenText(tok.sheet, a, b);
  });
}

export interface StructuralChange {
  sheetName: string;
  axis: 'row' | 'col';
  /** Índice donde se insertan/eliminan. */
  index: number;
  /** Positivo = inserción; negativo = eliminación. */
  count: number;
}

/** Ajusta referencias tras insertar o eliminar filas/columnas. */
export function adjustFormulaForStructure(formula: string, formulaSheet: string, ch: StructuralChange): string {
  return rewriteFormula(formula, (tok) => {
    const target = tok.sheet ?? formulaSheet;
    if (target !== ch.sheetName) return null;
    const key = ch.axis === 'row' ? 'row' : 'col';
    const adj = (v: number | null): number | null | 'del' => {
      if (v === null) return null;
      if (ch.count > 0) return v >= ch.index ? v + ch.count : v;
      const delEnd = ch.index - ch.count - 1; // último índice eliminado
      if (v < ch.index) return v;
      if (v > delEnd) return v + ch.count;
      return 'del';
    };
    if (!tok.b) {
      const v = adj(tok.a[key]);
      if (v === 'del') return `${tok.sheet !== undefined ? `${quoteSheet(tok.sheet)}!` : ''}#REF!`;
      return refTokenText(tok.sheet, { ...tok.a, [key]: v });
    }
    // Rango: se encoge si se eliminan filas/columnas de su interior.
    let s = tok.a[key];
    let e = tok.b[key];
    if (s === null || e === null) return null;
    if (ch.count > 0) {
      if (s >= ch.index) s += ch.count;
      if (e >= ch.index) e += ch.count;
    } else {
      const delStart = ch.index;
      const delEnd = ch.index - ch.count - 1;
      const n = -ch.count;
      if (delStart <= s && delEnd >= e) return `${tok.sheet !== undefined ? `${quoteSheet(tok.sheet)}!` : ''}#REF!`;
      const newS = s > delEnd ? s - n : s >= delStart ? delStart : s;
      const newE = e > delEnd ? e - n : e >= delStart ? delStart - 1 : e;
      s = newS;
      e = newE;
    }
    return refTokenText(tok.sheet, { ...tok.a, [key]: s }, { ...tok.b, [key]: e });
  });
}

/** Renombra una hoja en las referencias de una fórmula. */
export function renameSheetInFormula(formula: string, oldName: string, newName: string): string {
  return rewriteFormula(formula, (tok) => (tok.sheet !== undefined && tok.sheet.toLowerCase() === oldName.toLowerCase() ? refTokenText(newName, tok.a, tok.b) : null));
}
