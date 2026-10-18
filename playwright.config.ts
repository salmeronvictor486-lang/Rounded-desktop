import { defineConfig, devices } from '@playwright/test';

/** Pruebas de extremo a extremo sobre la compilación de producción (`vite preview`). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    locale: 'es-ES',
    // Sin una configuración regional UTF-8, Chromium descarta los nombres de descarga con tildes («título.docx» → «download»).
    launchOptions: { env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } },
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive\.spec\.ts/ },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
