# Arquitectura de Rounded Desktop

Rounded Desktop es una suite ofimática **local-first** que se ejecuta en el
navegador (y se puede instalar como PWA). Todos los documentos se guardan en el
dispositivo del usuario (IndexedDB); no se requiere cuenta ni servidor.

| Aplicación | Nombre | Tipo de archivo interno |
|---|---|---|
| Procesador de textos | **Rounded Scribe** | `document` |
| Hojas de cálculo | **Rounded Grid** | `spreadsheet` |
| Presentaciones | **Rounded Stage** | `presentation` |
| PDF | **Rounded Folio** | `pdf` |

Los nombres se cambian en `src/config/brand.ts`.

## 1. Decisiones técnicas

### Plataforma: aplicación web (TypeScript + React + Vite)

* **Por qué**: una sola base de código para web, PWA instalable y escritorio
  (empaquetable con Tauri o Electron sin reescribir nada, ver §8). El navegador
  aporta motores maduros que no conviene reimplementar: maquetación de texto,
  corrector ortográfico nativo, impresión/PDF con `@page`, `DOMParser` seguro
  (sin resolución de entidades externas), `CompressionStream`, etc.
* **Alternativas descartadas**:
  * *Integrar LibreOffice Online / Collabora / OnlyOffice*: fidelidad excelente,
    pero exige un servidor por usuario (coste de infraestructura) y OnlyOffice /
    Collabora tienen licencias AGPL o ediciones comerciales con límites de
    conexiones. Contradice el principio "gratuito y local".
  * *LibreOffice compilado a WebAssembly (ZetaJS / LOWA)*: >100 MB de descarga,
    rendimiento insuficiente en equipos normales y madurez limitada en 2026.
  * *Electron nativo desde el día 1*: añade complejidad de despliegue antes de
    tener editores funcionales (regla explícita del proyecto).

### Motores por módulo (verificados al instalar, ver `THIRD_PARTY_NOTICES.md`)

| Necesidad | Elección | Licencia | Motivo / alternativas evaluadas |
|---|---|---|---|
| Editor de texto enriquecido | **TipTap 3 / ProseMirror** | MIT | Modelo de documento con esquema estricto (seguridad frente a XSS, estructura exportable). Alternativas: Lexical (MIT, menos extensiones de tablas), Slate (inestable), CKEditor 5 (GPL o comercial), Quill (sin tablas complejas). |
| Importar DOCX | **Importador propio** (JSZip + DOMParser) | — | `mammoth` (BSD) descarta deliberadamente colores, tamaños, fuentes y alineación. Un importador propio lee `document.xml`, `styles.xml`, `numbering.xml`, relaciones, imágenes, notas al pie, encabezados/pies y `sectPr`. |
| Exportar DOCX | **docx** | MIT | Genera OOXML válido con estilos, tablas, imágenes, numeración, encabezados/pies con número de página, notas al pie y secciones. |
| ODT / RTF / TXT / HTML | **Conversores propios** | — | Formatos más simples; no hay bibliotecas JS maduras para ODT/RTF en navegador. |
| Motor de fórmulas | **Motor propio** (`src/modules/sheets/engine`) | — | HyperFormula es GPLv3 o comercial (incompatible con distribución comercial gratuita sin abrir código). formula.js solo aporta funciones, no análisis, referencias ni dependencias. El motor propio incluye analizador, grafo de dependencias con recálculo incremental, referencias relativas/absolutas/mixtas, referencias entre hojas y detección de ciclos. |
| XLSX | **ExcelJS** | MIT | Lee/escribe valores, fórmulas, estilos, formatos numéricos, combinaciones, dimensiones, paneles inmovilizados y validaciones. SheetJS CE (Apache-2.0) no conserva estilos y su paquete en npm está desactualizado con CVEs. |
| ODS | **Conversor propio** | — | Lectura/escritura de valores, fórmulas (sintaxis OpenFormula) y estilos básicos. |
| CSV | **Papa Parse** | MIT | Detección de separador; la codificación se detecta con `TextDecoder` (UTF-8 estricto → Windows-1252). |
| Gráficos | **SVG propio** | — | Ligero, imprimible y exportable. |
| Exportar PPTX | **PptxGenJS** | MIT | Texto con formato, formas, imágenes, tablas, notas, fondos. |
| Importar PPTX | **Importador propio** (JSZip + DOMParser) | — | No existe una biblioteca JS madura que convierta PPTX a un modelo editable. Se leen diapositivas, posiciones EMU, texto, formas, imágenes, tablas, fondos, notas y el tema. |
| Visor PDF | **PDF.js** | Apache-2.0 | Estándar de facto (Firefox). |
| Manipulación PDF | **pdf-lib** | MIT | Combinar, dividir, girar, eliminar, reordenar, anotar. |
| Almacenamiento | **IndexedDB** vía `idb` | ISC | Transaccional, admite Blobs grandes, disponible offline. |
| Sanitización HTML | **DOMPurify** | Apache-2.0 / MPL-2.0 | Para HTML pegado/importado antes de pasar por el esquema de ProseMirror. |
| Iconos | **Lucide** | ISC | Conjunto original y permisivo. |
| Estado global | **Zustand** | MIT | Pequeño y sin boilerplate. |
| Pruebas | **Vitest**, **Playwright** | MIT / Apache-2.0 | Unitarias/integración en jsdom; E2E en Chromium. |

## 2. Estructura de carpetas

```
src/
  config/          Marca y límites configurables
  core/            Núcleo independiente de la interfaz
    storage/       Repositorio IndexedDB, migraciones, versiones, conflictos, copias de seguridad
    files/         Validación de archivos, inspección ZIP segura, XML seguro, descargas
    util/          Utilidades (ids, debounce, colores, unidades)
  app/             Shell: rutas, barra lateral, tema, inicio, gestor de archivos, ajustes
  ui/              Componentes compartidos (botones, menús, diálogos, toasts, barra de herramientas)
  modules/
    writer/        Rounded Scribe: extensiones TipTap, barra de herramientas, formatos (docx/odt/rtf/txt/html), impresión
    sheets/        Rounded Grid: modelo, motor de fórmulas, formatos numéricos, cuadrícula virtualizada, gráficos, formatos (xlsx/ods/csv)
    slides/        Rounded Stage: modelo, lienzo, temas, presentador, formatos (pptx), exportación
    pdf/           Rounded Folio: visor PDF.js y operaciones pdf-lib
  templates/       Plantillas. Cada archivo se registra solo (import.meta.glob)
tests/
  unit/            Vitest (motor de fórmulas, conversores, almacenamiento, seguridad)
  interop/         Pruebas contra LibreOffice / python-docx / openpyxl / python-pptx
  e2e/             Playwright
```

Cada módulo de editor expone un **`AppModule`** (`src/app/modules.ts`): tipo de
archivo, nombre, icono, componente de editor (cargado de forma diferida),
creador de contenido vacío, importadores y exportadores. El shell no conoce los
detalles de cada editor; añadir *Rounded Forms* o *Rounded Data* consiste en
registrar un nuevo `AppModule`.

## 3. Modelo de datos y almacenamiento

Base de datos IndexedDB `rounded-desktop`:

| Almacén | Contenido |
|---|---|
| `files` | Metadatos: `id`, `name`, `kind`, `folderId`, `createdAt`, `updatedAt`, `openedAt`, `revision`, `size`, `trashed`, `templateId` |
| `contents` | Contenido por `id` (JSON para documentos/hojas/presentaciones, `Blob` para PDF) |
| `folders` | Carpetas jerárquicas |
| `versions` | Instantáneas (manuales y automáticas) con límite por archivo |
| `meta` | Versión de esquema, ajustes |

* **Migraciones**: `src/core/storage/migrations.ts` — lista ordenada de pasos
  aplicados en `upgrade` de IndexedDB. Nunca se borran datos sin migrarlos.
* **Conflictos**: cada guardado incluye la `revision` esperada. Si otra pestaña
  guardó antes, se lanza `ConflictError` y la interfaz ofrece *recargar*,
  *sobrescribir* o *guardar como copia*. Las pestañas se avisan con
  `BroadcastChannel`.
* **Autoguardado**: con retardo (debounce ~800 ms) y vaciado en
  `visibilitychange`/`pagehide`. Indicador de estado: *Guardando… / Guardado /
  Sin guardar / Error / Conflicto*.
* **Recuperación**: como el autoguardado escribe directamente en IndexedDB, el
  trabajo sobrevive a cierres inesperados (pérdida máxima ≈ 1 s). Además se
  guarda una instantánea automática en el historial cada 10 minutos de edición.
* **Copias de seguridad**: exportación/importación de todo el espacio de trabajo
  como `.zip` (Ajustes).
* **Nube**: interfaz `StorageProvider` definida; solo existe el proveedor local.
  No se simula ninguna sincronización (ver ROADMAP, fase 7).

## 4. Formatos admitidos

Ver la tabla completa y la evidencia de pruebas en `docs/FORMATS.md`.

| Formato | Importar | Exportar | Notas |
|---|---|---|---|
| DOCX | ✅ | ✅ | Ver limitaciones |
| ODT | ✅ básico | ✅ básico | Texto, títulos, formato, listas, tablas, imágenes |
| RTF | ✅ básico | ✅ básico | Texto, formato de caracteres, párrafos, alineación |
| TXT / HTML / Markdown (exp.) | ✅ | ✅ | |
| PDF (desde Scribe/Stage) | — | ✅ | Mediante el motor de impresión del navegador |
| DOC (binario) | ❌ | ❌ | Ver §6 |
| XLSX | ✅ | ✅ | Gráficos: no se conservan en XLSX (ExcelJS no los admite) |
| ODS | ✅ básico | ✅ básico | |
| CSV / TSV | ✅ | ✅ | Separador y codificación |
| XLS (binario) | ❌ | ❌ | Ver §6 |
| PPTX | ✅ | ✅ | Animaciones complejas, SmartArt y gráficos incrustados no se editan |
| PPT (binario) | ❌ | ❌ | Ver §6 |
| PDF | ✅ ver/anotar/manipular | ✅ | Edición del texto interno: fase posterior |

## 5. Seguridad

* **Importación**: límite de tamaño configurable (por defecto 100 MB),
  comprobación de firma (magic bytes), inspección del directorio central del ZIP
  **antes** de descomprimir (número de entradas, tamaño total descomprimido,
  relación de compresión, rutas con `..` o absolutas) contra *zip bombs* y
  *path traversal*.
* **XML**: `DOMParser` del navegador no resuelve entidades externas; además se
  rechazan documentos con `<!DOCTYPE` (XXE / *billion laughs*).
* **Contenido activo**: las macros (`vbaProject.bin`, `.docm/.xlsm/.pptm`) nunca
  se ejecutan; se descartan y se avisa al usuario. Los enlaces solo admiten
  `http`, `https`, `mailto` y anclas internas.
* **XSS**: ProseMirror solo admite nodos del esquema; el HTML externo pasa por
  DOMPurify. El contenido de celdas y diapositivas se renderiza como texto.
* **Privacidad**: sin telemetría, sin peticiones a terceros, imágenes remotas no
  se cargan automáticamente. CSP restrictiva en `index.html`.
* **Sin secretos en el cliente**: no hay claves de API.

## 6. Limitaciones conocidas

* **DOC/XLS/PPT binarios**: no hay bibliotecas JS con licencia permisiva y
  calidad suficiente. Ruta recomendada: convertir con LibreOffice
  (`soffice --headless --convert-to docx archivo.doc`). En la versión de
  escritorio se podrá invocar un LibreOffice local opcional.
* **Paginación en pantalla**: el editor de texto calcula saltos de página
  aproximados a partir de la altura de los bloques; la paginación exacta la hace
  el motor de impresión (PDF). Un párrafo muy largo no se divide visualmente
  entre páginas en el editor.
* **Fuentes**: si un documento usa fuentes no instaladas, el navegador las
  sustituye; el nombre de la fuente se conserva al exportar.
* **Gráficos en XLSX** y **gráficos/SmartArt en PPTX**: no se conservan como
  objetos editables.
* **Colaboración en tiempo real y sincronización**: no implementadas (requieren
  servidor). Ver ROADMAP.

## 7. Rendimiento

* Cuadrícula virtualizada: solo se renderizan las celdas visibles.
* Recálculo incremental: al cambiar una celda solo se recalculan sus
  dependientes transitivos.
* Bibliotecas pesadas (ExcelJS, docx, PptxGenJS, PDF.js, pdf-lib) se cargan bajo
  demanda con `import()` dinámico.

## 8. Ruta a escritorio

La aplicación es estática (`dist/`) y usa rutas por hash, por lo que puede
empaquetarse con **Tauri 2** (recomendado: binarios pequeños, MIT/Apache-2.0) o
Electron sin cambios: ver `docs/DESKTOP.md`.
