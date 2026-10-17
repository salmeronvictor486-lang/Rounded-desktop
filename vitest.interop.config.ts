import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config';

// Pruebas de interoperabilidad: usan LibreOffice y bibliotecas de Python
// (python-docx, openpyxl, python-pptx) como implementaciones independientes.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/interop/**/*.test.ts'],
      testTimeout: 120000,
      hookTimeout: 120000,
    },
  }),
);
