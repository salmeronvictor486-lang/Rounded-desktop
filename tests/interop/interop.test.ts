/**
 * Pruebas de interoperabilidad con implementaciones independientes:
 * LibreOffice (soffice), python-docx, openpyxl y python-pptx.
 *
 * Se ejecutan con `npm run test:interop`. Si las herramientas no están
 * instaladas, la suite se omite (no se da por superada en silencio: el
 * resumen indica "skipped").
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { importDocx } from '@/modules/writer/formats/docx/import';
import { exportDocxBuffer } from '@/modules/writer/formats/docx/export';
import { exportOdt, importOdt } from '@/modules/writer/formats/odt';
import { exportRtf, importRtf } from '@/modules/writer/formats/rtf';
import { createEmptyDocument, footnote, h, ol, p, t, table, ul } from '@/modules/writer/model';
import { importXlsx, exportXlsx } from '@/modules/sheets/formats/xlsx';
import { exportOds, importOds } from '@/modules/sheets/formats/ods';
import { Engine } from '@/modules/sheets/engine/engine';
import { isError, type Value } from '@/modules/sheets/engine/values';
import { cellKey } from '@/modules/sheets/model';
import { importPptx } from '@/modules/slides/formats/pptxImport';
import { exportPptx } from '@/modules/slides/formats/pptxExport';
import { createPresentation } from '@/modules/slides/model.create';
import { createSlide } from '@/modules/slides/layouts';
import { plainText } from '@/modules/slides/model';
import { lettersToCol } from '@/modules/sheets/engine/address';

const OUT = resolve(__dirname, '.out');
const PY = resolve(__dirname, 'py');

function has(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'ignore', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

const available = has('soffice', ['--version']) && has('python3', ['-c', 'import docx, openpyxl, pptx']);

function soffice(convertTo: string, file: string, outDir = OUT) {
  execFileSync('soffice', ['--headless', '--norestore', '--convert-to', convertTo, '--outdir', outDir, file], { stdio: 'ignore', timeout: 120_000 });
}

function pyRead(kind: string, file: string): any {
  return JSON.parse(execFileSync('python3', [join(PY, 'read_ours.py'), kind, file], { encoding: 'utf8', timeout: 60_000 }));
}

function bytes(path: string) {
  return new Uint8Array(readFileSync(path));
}

async function save(name: string, blob: Blob | Uint8Array) {
  const data = blob instanceof Uint8Array ? blob : new Uint8Array(await blob.arrayBuffer());
  const path = join(OUT, name);
  writeFileSync(path, data);
  return path;
}

describe.skipIf(!available)('Interoperabilidad con LibreOffice y bibliotecas Python', () => {
  beforeAll(() => {
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    execFileSync('python3', [join(PY, 'make_fixtures.py'), OUT], { timeout: 60_000 });
  });

  // ------------------------------------------------------------ DOCX
  it('DOCX creado con python-docx → importación en Scribe', async () => {
    const { content } = await importDocx(bytes(join(OUT, 'python-docx.docx')));
    const blocks = content.doc.content!;
    const types = blocks.map((b) => b.type);
    expect(types[0]).toBe('heading');
    const para = blocks[1].content!;
    expect(para.find((n) => n.text === 'negrita')?.marks?.some((m) => m.type === 'bold')).toBe(true);
    const red = para.find((n) => n.text === 'cursiva roja')!;
    expect(red.marks!.find((m) => m.type === 'textStyle')!.attrs!.color).toBe('#ff0000');
    expect(para.find((n) => n.text === 'grande')!.marks!.find((m) => m.type === 'textStyle')!.attrs!.fontSize).toBe('20pt');
    expect(blocks[2].attrs?.textAlign).toBe('center');
    expect(types).toContain('bulletList');
    expect(types).toContain('orderedList');
    const tbl = blocks.find((b) => b.type === 'table')!;
    expect(tbl.content![0].content![0].attrs!.colspan).toBe(2);
    expect(types).toContain('image');
    expect(types).toContain('pageBreak');
    expect(content.page.orientation).toBe('landscape');
    expect(content.page.header.text).toBe('Cabecera de prueba');
  });

  it('DOCX exportado por Scribe → python-docx y LibreOffice lo leen', async () => {
    const doc = createEmptyDocument({
      type: 'doc',
      content: [
        h(1, 'Título exportado'),
        p([t('Normal y '), t('negrita', [{ type: 'bold' }]), footnote('Una nota')]),
        ul(['uno', 'dos']),
        ol(['primero']),
        table([['C1', 'C2'], ['v1', 'v2']], { header: true }),
      ],
    });
    doc.page.orientation = 'landscape';
    doc.page.header = { text: 'Encabezado', align: 'center' };
    const path = await save('scribe.docx', await exportDocxBuffer(doc, 'Prueba'));
    const r = pyRead('docx', path);
    expect(r.paragraphs[0]).toMatchObject({ text: 'Título exportado', style: 'Heading 1' });
    expect(r.paragraphs[1].bold).toContain(true);
    expect(r.tables[0]).toEqual([['C1', 'C2'], ['v1', 'v2']]);
    expect(r.landscape).toBe(true);
    expect(r.header).toBe('Encabezado');
    soffice('txt:Text (encoded):UTF8', path);
    const txt = readFileSync(join(OUT, 'scribe.txt'), 'utf8');
    expect(txt).toContain('Título exportado');
    expect(txt).toContain('negrita');
  });

  // ------------------------------------------------------------ ODT / RTF
  it('ODT y RTF exportados por Scribe se abren en LibreOffice; los generados por LibreOffice se importan', async () => {
    const doc = createEmptyDocument({ type: 'doc', content: [h(1, 'Documento ODT'), p([t('Texto con '), t('negrita', [{ type: 'bold' }])]), table([['a', 'b']])] });
    const odt = await save('scribe.odt', await exportOdt(doc));
    soffice('txt:Text (encoded):UTF8', odt);
    expect(readFileSync(join(OUT, 'scribe.txt'), 'utf8')).toContain('Documento ODT');
    const rtf = await save('scribe-rtf.rtf', new Uint8Array(await exportRtf(doc).arrayBuffer()));
    soffice('txt:Text (encoded):UTF8', rtf);
    expect(readFileSync(join(OUT, 'scribe-rtf.txt'), 'utf8')).toContain('Documento ODT');

    // LibreOffice convierte el DOCX de python-docx a ODT y RTF; nosotros los importamos
    soffice('odt', join(OUT, 'python-docx.docx'));
    soffice('rtf', join(OUT, 'python-docx.docx'));
    const fromOdt = await importOdt(bytes(join(OUT, 'python-docx.odt')));
    const odtTypes = fromOdt.content.doc.content!.map((b) => b.type);
    expect(odtTypes).toContain('heading');
    expect(odtTypes).toContain('table');
    expect(JSON.stringify(fromOdt.content.doc)).toContain('negrita');
    const fromRtf = importRtf(readFileSync(join(OUT, 'python-docx.rtf'), 'latin1'));
    expect(JSON.stringify(fromRtf.content.doc)).toContain('Informe de interoperabilidad');
    expect(JSON.stringify(fromRtf.content.doc)).toContain('"bold"');
  });

  it('DOC binario (Word 97-2003): se convierte con LibreOffice y se importa el DOCX resultante', async () => {
    soffice('doc', join(OUT, 'python-docx.docx'));
    const docPath = join(OUT, 'python-docx.doc');
    expect(existsSync(docPath)).toBe(true);
    mkdirSync(join(OUT, 'from-doc'), { recursive: true });
    soffice('docx', docPath, join(OUT, 'from-doc'));
    const { content } = await importDocx(bytes(join(OUT, 'from-doc', 'python-docx.docx')));
    expect(JSON.stringify(content.doc)).toContain('Informe de interoperabilidad');
  });

  // ------------------------------------------------------------ XLSX
  it('XLSX de openpyxl: nuestro motor calcula lo mismo que LibreOffice', async () => {
    const { wb } = await importXlsx(bytes(join(OUT, 'openpyxl.xlsx')));
    const engine = new Engine(wb);
    const sheet = wb.sheets[0];
    // Valores de referencia calculados por LibreOffice
    soffice('csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', join(OUT, 'openpyxl.xlsx'));
    const csv = readFileSync(join(OUT, 'openpyxl-Datos.csv'), 'utf8').trim().split('\n').map((l) => l.split(','));
    const fmt = (v: Value) => (v === null ? '' : isError(v) ? v.code : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? String(Number(v.toPrecision(12))) : v);
    const mismatches: string[] = [];
    let compared = 0;
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (cell.f === undefined) continue;
      const [r, c] = key.split(',').map(Number);
      const ref = String.fromCharCode(65 + c) + (r + 1);
      if (ref === 'G2') continue; // fecha: LibreOffice la escribe con formato
      const ours = fmt(engine.getValue(sheet.id, r, c));
      const theirs = csv[r]?.[c] ?? '';
      compared++;
      if (ours !== theirs) mismatches.push(`${ref} =${cell.f}: nuestro=${ours} LibreOffice=${theirs}`);
    }
    expect(compared).toBeGreaterThanOrEqual(18);
    expect(mismatches).toEqual([]);
    expect(engine.getValue(sheet.id, 1, lettersToCol('G'))).toBe(45731);
    // Formato y estructura
    const s = wb.styles[sheet.cells[cellKey(0, 0)].s!];
    expect(s).toMatchObject({ bold: true, color: '#ffffff', bg: '#0f766e' });
    expect(sheet.merges).toEqual([{ r1: 6, c1: 0, r2: 6, c2: 2 }]);
    expect(sheet.freeze).toEqual({ rows: 1, cols: 0 });
    expect(wb.sheets.map((x) => x.name)).toEqual(['Datos', 'Resumen']);
  });

  it('XLSX exportado por Grid: openpyxl lee fórmulas, valores y formato; LibreOffice recalcula igual', async () => {
    const { wb } = await importXlsx(bytes(join(OUT, 'openpyxl.xlsx')));
    const { blob } = await exportXlsx(wb);
    const path = await save('grid.xlsx', blob);
    const r = pyRead('xlsx', path);
    expect(r.sheets).toEqual(['Datos', 'Resumen']);
    expect(r.cells.D5).toBe('=SUM(D2:D4)');
    expect(r.values.D5).toBe(57);
    expect(r.values.E4).toBe(3);
    expect(r.bold_A1).toBe(true);
    expect(r.fill_A1).toBe('FF0F766E');
    expect(r.merged).toEqual(['A7:C7']);
    expect(r.freeze).toBe('A2');
    mkdirSync(join(OUT, 'grid-csv'), { recursive: true });
    soffice('csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', path, join(OUT, 'grid-csv'));
    const lo = readFileSync(join(OUT, 'grid-csv', 'grid-Datos.csv'), 'utf8');
    expect(lo.split('\n')[4]).toContain('57');
  });

  it('ODS exportado por Grid se abre en LibreOffice; ODS de LibreOffice se importa con fórmulas', async () => {
    const { wb } = await importXlsx(bytes(join(OUT, 'openpyxl.xlsx')));
    const odsPath = await save('grid.ods', (await exportOds(wb)).blob);
    mkdirSync(join(OUT, 'ods-csv'), { recursive: true });
    soffice('csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', odsPath, join(OUT, 'ods-csv'));
    const lo = readFileSync(join(OUT, 'ods-csv', 'grid-Datos.csv'), 'utf8').split('\n');
    expect(lo[4]).toContain('57');
    soffice('ods', join(OUT, 'openpyxl.xlsx'));
    const { wb: fromOds } = await importOds(bytes(join(OUT, 'openpyxl.ods')));
    const engine = new Engine(fromOds);
    const s = fromOds.sheets[0];
    expect(s.cells[cellKey(4, 3)].f).toBe('SUM(D2:D4)');
    expect(engine.getValue(s.id, 4, 3)).toBe(57);
    expect(engine.getValue(s.id, 4, 5)).toBe(42);
  });

  it('XLS binario (Excel 97-2003): se convierte con LibreOffice y se importa', async () => {
    soffice('xls', join(OUT, 'openpyxl.xlsx'));
    mkdirSync(join(OUT, 'from-xls'), { recursive: true });
    soffice('xlsx', join(OUT, 'openpyxl.xls'), join(OUT, 'from-xls'));
    const { wb } = await importXlsx(bytes(join(OUT, 'from-xls', 'openpyxl.xlsx')));
    expect(new Engine(wb).getValue(wb.sheets[0].id, 4, 3)).toBe(57);
  });

  // ------------------------------------------------------------ PPTX
  it('PPTX de python-pptx → importación en Stage', async () => {
    const { content } = await importPptx(bytes(join(OUT, 'python-pptx.pptx')));
    expect(content.slides).toHaveLength(3);
    const texts = content.slides.map((s) => s.elements.map((e) => ('content' in e ? plainText(e.content) : e.type === 'table' ? 'TABLE' : e.type)).join(' | '));
    expect(texts[0]).toContain('Título desde python-pptx');
    expect(texts[0]).toContain('Subtítulo');
    expect(texts[1]).toContain('Primer punto');
    expect(texts[1]).toContain('Óvalo');
    const oval = content.slides[1].elements.find((e) => e.type === 'shape') as any;
    expect(oval.shape).toBe('ellipse');
    expect(oval.fill).toBe('#2288ee');
    expect(content.slides[2].elements.some((e) => e.type === 'image')).toBe(true);
    const tbl = content.slides[2].elements.find((e) => e.type === 'table') as any;
    expect(tbl.rows.map((r: any) => r.map((c: any) => c.text))).toEqual([['H1', 'H2'], ['v1', 'v2']]);
    expect(content.slides[2].notes).toBe('Notas desde python-pptx');
    const body = content.slides[1].elements.find((e) => 'content' in e && plainText(e.content).includes('Primer punto')) as any;
    expect(body.content.content[0].type).toBe('bulletList');
  });

  it('PPTX exportado por Stage → python-pptx lo lee y LibreOffice lo convierte a PDF', async () => {
    const pres = createPresentation();
    pres.slides.push(createSlide('titleContent', pres, { title: 'Agenda', body: ['Punto A', 'Punto B'] }));
    pres.slides[1].notes = 'Notas exportadas';
    pres.slides[1].elements.push({ id: 't', type: 'table', x: 100, y: 300, w: 400, h: 100, rotation: 0, rows: [[{ text: 'x' }, { text: 'y' }]], colWidths: [0.5, 0.5], fontSize: 16, headerRow: false, borderColor: '#999999', headerFill: '#000000' });
    const path = await save('stage.pptx', (await exportPptx(pres, 'Prueba')).blob);
    const r = pyRead('pptx', path);
    expect(r.slides).toHaveLength(2);
    const allText = JSON.stringify(r.slides);
    expect(allText).toContain('Título de la presentación');
    expect(allText).toContain('Punto A');
    expect(r.slides[1].notes).toBe('Notas exportadas');
    expect(r.slides[1].shapes.some((s: any) => JSON.stringify(s.table) === '[["x","y"]]')).toBe(true);
    soffice('pdf', path);
    expect(readFileSync(join(OUT, 'stage.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('PPT binario (PowerPoint 97-2003): se convierte con LibreOffice y se importa', async () => {
    soffice('ppt', join(OUT, 'python-pptx.pptx'));
    mkdirSync(join(OUT, 'from-ppt'), { recursive: true });
    soffice('pptx', join(OUT, 'python-pptx.ppt'), join(OUT, 'from-ppt'));
    const { content } = await importPptx(bytes(join(OUT, 'from-ppt', 'python-pptx.pptx')));
    expect(content.slides).toHaveLength(3);
    expect(JSON.stringify(content.slides[0])).toContain('Título desde python-pptx');
  });

  it('deja los archivos generados para inspección manual', () => {
    expect(readdirSync(OUT).length).toBeGreaterThan(10);
  });
});
