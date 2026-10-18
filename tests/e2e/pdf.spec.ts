import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, type PDFObject } from 'pdf-lib';
import { trackErrors, waitSaved } from './helpers';

const FIXTURE = 'tests/fixtures/muestra-3-paginas.pdf';

test('Folio: abrir, buscar, anotar, girar, eliminar páginas y descargar', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar archivo' }).click()]);
  await chooser.setFiles(FIXTURE);
  const thumbs = page.getByRole('navigation', { name: 'Páginas' }).getByRole('button');
  await expect(thumbs).toHaveCount(3);
  const page1 = page.getByRole('region', { name: 'Página 1' });
  await expect(page1.locator('.textLayer span').first()).toBeAttached();

  // Búsqueda de texto
  await page.getByRole('button', { name: 'Buscar (Ctrl+F)' }).click();
  await page.getByLabel('Buscar en el PDF').fill('presupuesto');
  await page.getByLabel('Buscar en el PDF').press('Enter');
  await expect(page.getByText('1 resultado(s)')).toBeVisible();

  // Resaltado arrastrando sobre la página 1 y nota con texto
  await page.getByRole('radio', { name: 'Resaltar', exact: true }).click();
  const box = (await page1.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 90, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('radio', { name: 'Nota', exact: true }).click();
  await page1.click({ position: { x: 80, y: 200 } });
  await page.getByRole('dialog').getByLabel('Texto').fill('Revisar cifras');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.getByRole('heading', { name: 'Anotaciones (2)' })).toBeVisible();

  // Girar la página 1 y eliminar la 3
  await thumbs.nth(0).click();
  await page.getByRole('button', { name: 'Girar a la derecha' }).click();
  await expect(page.getByText('Página(s) girada(s).')).toBeVisible();
  await thumbs.nth(2).click();
  await page.getByRole('button', { name: 'Eliminar página(s)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Eliminar/ }).click();
  await expect(thumbs).toHaveCount(2);

  await waitSaved(page);
  await page.reload();
  await expect(thumbs).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Anotaciones (2)' })).toBeVisible();

  await page.getByRole('button', { name: 'Archivo', exact: true }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Descargar PDF (con anotaciones)' }).click();
  const path = await (await dl).path();
  const out = await PDFDocument.load(readFileSync(path!));
  expect(out.getPageCount()).toBe(2);
  expect(out.getPage(0).getRotation().angle).toBe(90);
  expect(out.getPage(1).getRotation().angle).toBe(0);
  // Las anotaciones se incrustan como contenido: la página 1 crece respecto al original
  const orig = await PDFDocument.load(readFileSync(FIXTURE));
  const streamLen = (d: PDFDocument) => {
    const c = d.getPage(0).node.Contents();
    const parts: PDFObject[] = c instanceof PDFArray ? c.asArray().map((r) => d.context.lookup(r)!) : c ? [c] : [];
    return parts.reduce((n, s) => n + (s instanceof PDFRawStream ? decodePDFRawStream(s).decode().length : 0), 0);
  };
  expect(streamLen(out)).toBeGreaterThan(streamLen(orig));
  expect(errors).toEqual([]);
});
