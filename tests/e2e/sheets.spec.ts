import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { newFromHome, trackErrors, waitSaved } from './helpers';

const cell = (page: Page, ref: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  const c = m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return page.locator(`.cell[data-r="${Number(m[2]) - 1}"][data-c="${c}"]`);
};

/** Selecciona con el cuadro de nombres (devuelve el foco a la cuadrícula). */
async function goTo(page: Page, ref: string) {
  const box = page.getByLabel(/Cuadro de nombres/);
  await box.fill(ref);
  await box.press('Enter');
}

/** Escribe valores hacia abajo empezando en `ref`. */
async function typeDown(page: Page, ref: string, values: string[]) {
  await goTo(page, ref);
  for (const v of values) {
    await page.keyboard.type(v);
    await page.keyboard.press('Enter');
  }
}

test('Grid: fórmulas, recálculo, deshacer y persistencia', async ({ page }) => {
  const errors = trackErrors(page);
  await newFromHome(page, /Nuevo: hoja de cálculo/);
  await expect(page.getByRole('grid')).toBeVisible();
  await typeDown(page, 'A1', ['10', '20', '=SUMA(A1:A2)', '=PROMEDIO(A1:A2)*2', '=SI(A3>25;"alto";"bajo")']);
  await expect(cell(page, 'A3')).toHaveText('30');
  await expect(cell(page, 'A4')).toHaveText('30');
  await expect(cell(page, 'A5')).toHaveText('alto');
  await typeDown(page, 'A1', ['1']);
  await expect(cell(page, 'A3')).toHaveText('21');
  await expect(cell(page, 'A5')).toHaveText('bajo');
  await page.keyboard.press('Control+z');
  await expect(cell(page, 'A3')).toHaveText('30');
  // Error de referencia circular visible
  await typeDown(page, 'B1', ['=B1+1']);
  await expect(cell(page, 'B1')).toHaveText('#CIRC!');
  await page.keyboard.press('Control+z');
  await waitSaved(page);
  await page.reload();
  await expect(cell(page, 'A3')).toHaveText('30');
  await goTo(page, 'A3');
  await expect(page.getByLabel('Barra de fórmulas')).toHaveValue(/^=(SUMA|SUM)\(A1:A2\)$/);
  expect(errors).toEqual([]);
});

test('Grid: copiar y pegar ajusta referencias relativas', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await newFromHome(page, /Nuevo: hoja de cálculo/);
  await typeDown(page, 'A1', ['1', '2', '=A1+A2']);
  await typeDown(page, 'B1', ['10', '20']);
  await goTo(page, 'A3');
  await page.keyboard.press('Control+c');
  await goTo(page, 'B3');
  await page.keyboard.press('Control+v');
  await expect(cell(page, 'B3')).toHaveText('30');
  await expect(page.getByLabel('Barra de fórmulas')).toHaveValue('=B1+B2');
});

test('Grid: ordenar, formato numérico e inmovilizar fila', async ({ page }) => {
  await newFromHome(page, /Nuevo: hoja de cálculo/);
  await typeDown(page, 'A1', ['Fruta', 'pera', 'manzana', 'uva']);
  await goTo(page, 'A2:A4');
  await page.getByRole('button', { name: 'Ordenar de A a Z' }).click();
  await expect(cell(page, 'A2')).toHaveText('manzana');
  await expect(cell(page, 'A3')).toHaveText('pera');
  await expect(cell(page, 'A4')).toHaveText('uva');

  await typeDown(page, 'B2', ['1234,5']);
  await goTo(page, 'B2');
  await page.getByLabel('Formato numérico').selectOption('eur');
  await expect(cell(page, 'B2')).toHaveText(/1\.234,50\s?€/);

  await page.getByRole('button', { name: 'Inmovilizar' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Primera fila' }).or(page.getByRole('menuitem', { name: 'Primera fila' })).click();
  const grid = page.getByRole('grid');
  await grid.evaluate((el) => { el.scrollTop = 3000; });
  await page.waitForTimeout(200);
  const gridBox = (await grid.boundingBox())!;
  const headerBox = (await cell(page, 'A1').boundingBox())!;
  expect(headerBox.y).toBeLessThan(gridBox.y + 60);
  await expect(cell(page, 'A1')).toHaveText('Fruta');
});

test('Grid: importar CSV en español y exportar XLSX', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar archivo' }).click()]);
  await chooser.setFiles({ name: 'gastos.csv', mimeType: 'text/csv', buffer: Buffer.from('Concepto;Importe\nAlquiler;"1.200,50"\nLuz;80\n', 'utf8') });
  await expect(cell(page, 'A2')).toHaveText('Alquiler');
  await typeDown(page, 'B4', ['=SUMA(B2:B3)']);
  await expect(cell(page, 'B4')).toHaveText(/1\.?280,5/);

  await page.getByRole('button', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Descargar como' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Libro de Excel/ }).click();
  const path = await (await dl).path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(path!) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  expect(ws.getCell('A2').value).toBe('Alquiler');
  expect(ws.getCell('B2').value).toBe(1200.5);
  const f = ws.getCell('B4').value as { formula: string; result: number };
  expect(f.formula).toBe('SUM(B2:B3)');
  expect(f.result).toBe(1280.5);
  expect(errors).toEqual([]);
});
