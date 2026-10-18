import { expect, test, type Page } from '@playwright/test';
import { trackErrors, waitSaved } from './helpers';

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('móvil: navegación lateral plegable y sin desplazamiento horizontal', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenido a Rounded Desktop' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav).not.toBeInViewport();
  await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await expect(nav).toBeInViewport();
  await nav.getByRole('link', { name: 'Plantillas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plantillas', level: 1 })).toBeVisible();
  await expect(nav).not.toBeInViewport();
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('móvil: editar un documento y usar el menú compacto', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Nuevo: documento/ }).click();
  await page.locator('.doc-content').click();
  await page.keyboard.type('Escrito desde el móvil');
  await waitSaved(page);
  await expect(page.getByRole('navigation', { name: 'Menú del editor' })).toBeHidden();
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: 'Descargar como' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Texto sin formato/ }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.txt$/);
  // Elegir una opción de un submenú cierra toda la cascada
  await expect(page.getByRole('menu')).toHaveCount(0);
});
