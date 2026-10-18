import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newFromHome, trackErrors, waitSaved } from './helpers';

test('Scribe: escribir, formato, tabla, persistencia y exportar/importar DOCX', async ({ page }) => {
  const errors = trackErrors(page);
  await newFromHome(page, /Nuevo: documento/);
  const ed = page.locator('.doc-content');
  await ed.click();
  await page.keyboard.type('Informe de prueba');
  await page.getByLabel('Estilo de párrafo').selectOption('h1');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Texto en ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('negrita');
  await page.keyboard.press('Control+b');
  await page.getByRole('button', { name: 'Insertar tabla' }).click();
  await page.getByRole('button', { name: /Insertar 3 × 3/ }).click();
  await expect(ed.locator('table')).toHaveCount(1);
  await expect(ed.locator('h1')).toHaveText('Informe de prueba');
  await expect(ed.locator('strong')).toHaveText('negrita');
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.doc-content h1')).toHaveText('Informe de prueba');
  await expect(page.locator('.doc-content table')).toHaveCount(1);

  // Buscar y reemplazar
  await page.keyboard.press('Control+h');
  await page.getByLabel('Buscar', { exact: true }).fill('prueba');
  await page.getByLabel('Reemplazar por').fill('ensayo');
  await page.getByRole('button', { name: 'Reemplazar todo' }).click();
  await expect(page.locator('.doc-content h1')).toHaveText('Informe de ensayo');

  // Exportar DOCX y volver a importarlo
  await page.getByRole('button', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Descargar como' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Word \(\.docx\)/ }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.docx$/);
  const path = await file.path();
  expect(readFileSync(path!).subarray(0, 2).toString()).toBe('PK');
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar archivo' }).click()]);
  await chooser.setFiles({ name: 'reimportado.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: readFileSync(path!) });
  await expect(page.locator('.doc-content h1')).toHaveText('Informe de ensayo');
  await expect(page.locator('.doc-content table')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Scribe: plantilla con índice automático y configuración de página', async ({ page }) => {
  await page.goto('/#/templates?kind=document');
  await page.getByRole('article', { name: 'Informe empresarial' }).getByRole('button', { name: 'Usar plantilla' }).click();
  await expect(page.locator('.doc-content .toc .toc-entry').first()).toHaveText('1. Resumen ejecutivo');
  await page.getByRole('button', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Configurar página…' }).click();
  await page.getByLabel('Orientación').selectOption('landscape');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  const width = await page.locator('.doc-page').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(1000);
});
