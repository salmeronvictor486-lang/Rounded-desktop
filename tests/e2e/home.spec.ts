import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers';

test('inicio, navegación, tema y accesibilidad básica', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenido a Rounded Desktop' })).toBeVisible();
  for (const app of ['Rounded Scribe', 'Rounded Grid', 'Rounded Stage', 'Rounded Folio']) {
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByText(app)).toBeVisible();
  }
  await page.getByRole('link', { name: 'Plantillas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plantillas', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('radio', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Enlace para saltar al contenido con el teclado: es lo primero que recibe el foco
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await expect(page).toHaveURL(/:4173\/(#\/?)?$/);
  expect(errors).toEqual([]);
});

test('gestión de archivos: carpetas, renombrar, duplicar, buscar, papelera', async ({ page }) => {
  await page.goto('/#/files');
  await page.getByRole('button', { name: 'Carpeta' }).click();
  await page.getByLabel('Nombre de la carpeta').fill('Trabajo');
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('button', { name: 'Trabajo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trabajo', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo archivo' }).click();
  await page.getByRole('menuitem', { name: /Documento \(Scribe\)/ }).click();
  await expect(page.locator('.doc-content')).toBeVisible();
  await page.getByLabel('Nombre del archivo').fill('Informe trimestral');
  await page.getByLabel('Nombre del archivo').press('Enter');
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await page.goto('/#/files?q=trimestral');
  await expect(page.getByRole('button', { name: 'Informe trimestral', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Acciones de Informe trimestral', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(page.getByRole('button', { name: 'Informe trimestral (copia)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Acciones de Informe trimestral (copia)' }).click();
  await page.getByRole('menuitem', { name: 'Mover a la papelera' }).click();
  await page.getByRole('button', { name: 'Mover a la papelera' }).click();
  await expect(page.getByRole('button', { name: 'Informe trimestral (copia)', exact: true })).toHaveCount(0);
  await page.goto('/#/trash');
  await page.getByRole('button', { name: 'Acciones de Informe trimestral (copia)' }).click();
  await page.getByRole('menuitem', { name: 'Restaurar' }).click();
  await expect(page.getByText('La papelera está vacía.')).toBeVisible();
});
