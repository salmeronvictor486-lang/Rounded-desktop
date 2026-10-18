import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Pruebas de interoperabilidad: usan LibreOffice y bibliotecas de Python
// (python-docx, openpyxl, python-pptx) como implementaciones independientes.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/interop/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
});
