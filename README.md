# Rounded Desktop

**Suite ofimática gratuita, local y privada.** Documentos, hojas de cálculo,
presentaciones y PDF en el navegador o instalada como aplicación, sin cuenta,
sin anuncios y sin enviar tus archivos a ningún servidor.

| Aplicación | Para qué sirve | Formatos |
|---|---|---|
| **Rounded Scribe** | Procesador de textos | DOCX, ODT, RTF, HTML, Markdown, TXT, PDF (exportar) |
| **Rounded Grid** | Hojas de cálculo con motor de fórmulas propio | XLSX, ODS, CSV, TSV |
| **Rounded Stage** | Presentaciones con modo presentador | PPTX, PNG, PDF (exportar) |
| **Rounded Folio** | Visor y herramientas PDF | PDF |

La compatibilidad real, con sus límites y las pruebas que la respaldan, está en
[`docs/FORMATS.md`](docs/FORMATS.md).

---

## Qué incluye

**Rounded Scribe**
- Estilos de párrafo (títulos 1–4, cita, código), negrita, cursiva, subrayado,
  tachado, superíndice, subíndice, color, resaltado, fuente y tamaño.
- Alineación, interlineado, sangrías, espaciado, listas con viñetas y numeradas,
  tablas (combinar, añadir/eliminar filas y columnas), imágenes,
  enlaces, saltos de página, notas al pie e índice automático.
- Configuración de página (tamaño, orientación, márgenes), encabezado, pie y
  numeración de página al imprimir o exportar a PDF.
- Buscar y reemplazar, recuento de palabras, deshacer/rehacer, pegar como
  texto sin formato.

**Rounded Grid**
- Cuadrícula virtualizada (miles de filas fluidas), varias hojas, inmovilizar
  filas y columnas, combinar celdas, ancho/alto ajustable.
- Motor de fórmulas propio: unas 150 funciones (matemáticas, estadísticas,
  lógicas, texto, búsqueda, fecha y hora, financieras), nombres en español
  (`=SUMA`, `=SI`, `=BUSCARV`…), referencias relativas/absolutas/entre hojas,
  recálculo incremental y detección de referencias circulares.
- Formatos numéricos tipo Excel (moneda, porcentaje, fechas, personalizados),
  formato condicional, validación de datos con listas, ordenar, filtros,
  rellenar series, buscar y reemplazar, copiar/pegar con Excel y gráficos
  (columnas, barras, líneas, área, circular, dispersión).

**Rounded Stage**
- Diapositivas con 8 diseños y 8 temas, cuadros de texto enriquecido, formas,
  líneas y flechas, imágenes, tablas, fondos, notas del orador.
- Mover, redimensionar, girar, alinear, distribuir, capas, copiar/pegar,
  deshacer/rehacer.
- Modo presentación a pantalla completa con transiciones, animaciones de
  entrada, notas y navegación por teclado.

**Rounded Folio**
- Visor con texto seleccionable, búsqueda y miniaturas.
- Girar, reordenar, eliminar, insertar (combinar) y extraer (dividir) páginas.
- Anotaciones: resaltado, tachado, recuadro, nota y texto libre; se incrustan
  en el PDF al descargar.

**Común**
- Inicio con recientes, búsqueda, carpetas, destacados, papelera y plantillas.
- Guardado automático, historial de versiones, recuperación tras cierre,
  detección de conflictos entre pestañas y copias de seguridad (.zip).
- 24 plantillas: currículums, cartas, informes, trabajos académicos, apuntes,
  facturas y presupuestos, finanzas personales, planificación, proyectos,
  inventario, educación, presentaciones de empresa, tecnología y portfolio.
- Tema claro y oscuro, atajos de teclado, navegación con teclado y lector de
  pantalla, diseño adaptado a móvil, instalable como PWA y funcionamiento sin
  conexión.

## Empezar

Requisitos: **Node.js 20 o superior** y npm.

```bash
npm install
npm run dev          # servidor de desarrollo en http://localhost:5173
```

Compilar la versión de producción (estática, en `dist/`):

```bash
npm run build
npm run preview      # sirve dist/ en http://localhost:4173
```

`dist/` se puede publicar en cualquier alojamiento estático (Netlify, GitHub
Pages, Nginx…). Usa rutas con `#`, así que no necesita reglas de reescritura.
Para empaquetarla como aplicación de escritorio, ver
[`docs/DESKTOP.md`](docs/DESKTOP.md).

## Pruebas

| Orden | Qué comprueba |
|---|---|
| `npm test` | Pruebas unitarias e integración (Vitest + jsdom): almacenamiento, motor de fórmulas, formatos numéricos, operaciones de hoja, ida y vuelta DOCX/XLSX/ODS/CSV/PPTX, operaciones PDF, plantillas. |
| `npm run test:e2e` | Extremo a extremo con Playwright sobre la compilación de producción (ejecuta antes `npm run build`). Escritorio y móvil. |
| `npm run test:interop` | Interoperabilidad con LibreOffice, python-docx, openpyxl y python-pptx (necesita esas herramientas instaladas). |
| `npm run lint` · `npm run typecheck` | ESLint y TypeScript estricto. |

El plan de pruebas completo y cómo preparar el entorno de interoperabilidad
están en [`docs/TESTING.md`](docs/TESTING.md).

## Privacidad y seguridad

- Todo se guarda en el navegador (IndexedDB). No hay telemetría, analítica ni
  peticiones a terceros; la política de seguridad de contenido (CSP) lo impide.
- Las macros de documentos de Office nunca se ejecutan: se descartan y se avisa.
- Los archivos importados se validan (tamaño, firma, ZIP y XML seguros) antes de
  abrirlos.

Detalles y modelo de amenazas en [`docs/SECURITY.md`](docs/SECURITY.md).

## Documentación

- [`ARCHITECTURE.md`](ARCHITECTURE.md): decisiones técnicas, estructura y almacenamiento.
- [`ROADMAP.md`](ROADMAP.md): estado de cada fase, pendientes y bloqueos.
- [`docs/FORMATS.md`](docs/FORMATS.md): compatibilidad de formatos con evidencia.
- [`docs/TESTING.md`](docs/TESTING.md): plan de pruebas.
- [`docs/SECURITY.md`](docs/SECURITY.md): seguridad y dependencias.
- [`docs/TEMPLATES.md`](docs/TEMPLATES.md): cómo añadir plantillas.
- [`docs/DESKTOP.md`](docs/DESKTOP.md): empaquetado de escritorio.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md): problemas frecuentes.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): licencias de terceros.

## Licencias de terceros

Todas las dependencias incluidas en la aplicación tienen licencias permisivas
(MIT, ISC, Apache-2.0, BSD, 0BSD, BlueOak, Unlicense; JSZip y DOMPurify se usan
bajo su opción MIT y Apache-2.0 respectivamente). Lista completa en
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Rounded Desktop no está afiliado a Microsoft, Google ni LibreOffice. Los nombres
de formatos (DOCX, XLSX, PPTX…) se usan solo para indicar compatibilidad.
