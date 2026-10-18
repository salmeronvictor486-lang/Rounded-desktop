import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { newFromHome, trackErrors, waitSaved } from './helpers';

test('Stage: editar, añadir diapositivas y formas, presentar, persistir y exportar PPTX', async ({ page }) => {
  const errors = trackErrors(page);
  await newFromHome(page, /Nuevo: presentación/);
  const stage = page.locator('.ed-el');
  const title = page.locator('.ed-el.sl-text').first();
  await expect(title).toBeVisible();
  await title.dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Plan de lanzamiento');
  await page.keyboard.press('Escape');
  await expect(title).toContainText('Plan de lanzamiento');

  // Nueva diapositiva con diseño de título y contenido + una forma
  await page.getByRole('button', { name: 'Nueva diapositiva' }).click();
  await page.getByRole('menuitem', { name: 'Título y contenido' }).click();
  await expect(page.getByRole('navigation', { name: 'Diapositivas' }).getByLabel(/^Diapositiva \d/)).toHaveCount(2);
  const before = await stage.count();
  await page.getByRole('button', { name: 'Formas' }).click();
  await page.getByRole('menuitem', { name: 'Elipse' }).click();
  await expect(stage).toHaveCount(before + 1);
  await page.getByLabel('Notas del orador').fill('Recordar presupuesto');

  // Mover la forma con el ratón y deshacer
  const shape = page.locator('.ed-el.sl-shape').last();
  const box1 = (await shape.boundingBox())!;
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.down();
  await page.mouse.move(box1.x + box1.width / 2 + 80, box1.y + box1.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const box2 = (await shape.boundingBox())!;
  expect(box2.x - box1.x).toBeGreaterThan(40);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => Math.round((await shape.boundingBox())!.x)).toBe(Math.round(box1.x));

  // Presentar desde la primera diapositiva
  await page.getByRole('navigation', { name: 'Diapositivas' }).getByLabel('Diapositiva 1').click();
  await page.getByRole('button', { name: 'Presentar', exact: true }).click();
  const presenter = page.getByLabel('Modo presentación');
  await expect(presenter).toBeVisible();
  await expect(presenter.getByText('1 / 2')).toBeVisible();
  await presenter.getByRole('button', { name: 'Siguiente' }).click();
  await expect(presenter.getByText('2 / 2')).toBeVisible();
  await presenter.getByRole('button', { name: 'Mostrar notas (S)' }).click();
  await expect(presenter.getByText('Recordar presupuesto')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(presenter.getByText('1 / 2')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(presenter).toHaveCount(0);

  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.ed-el.sl-text').first()).toContainText('Plan de lanzamiento');
  await expect(page.getByRole('navigation', { name: 'Diapositivas' }).getByLabel(/^Diapositiva \d/)).toHaveCount(2);

  // Exportar a PPTX y comprobar el paquete
  await page.getByRole('button', { name: 'Archivo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Descargar como' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /PowerPoint/ }).click();
  const path = await (await dl).path();
  const zip = await JSZip.loadAsync(readFileSync(path!));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides).toHaveLength(2);
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('Plan de lanzamiento');
  expect(await zip.file('ppt/slides/slide2.xml')!.async('string')).toContain('prstGeom prst="ellipse"');
  const notes = Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\/.*\.xml$/.test(f));
  const notesText = (await Promise.all(notes.map((n) => zip.file(n)!.async('string')))).join('');
  expect(notesText).toContain('Recordar presupuesto');
  expect(errors).toEqual([]);
});
