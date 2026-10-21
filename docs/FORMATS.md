# Compatibilidad de formatos

Este documento dice qué se conserva y qué no al abrir y guardar cada formato, y
qué prueba lo respalda. Solo se marca como compatible lo que una prueba
automática ejecuta. Cuando un archivo pierde algo al importarlo o exportarlo,
la aplicación muestra un aviso concreto (por ejemplo «Las animaciones de
entrada no se exportan a PPTX»); no hay pérdidas silenciosas conocidas.

Leyenda: ✅ compatible y probado · 🟡 parcial (ver notas) · ❌ no admitido.

Pruebas citadas:

- **U**: unitarias (`npm test`, carpeta `tests/unit/`).
- **E**: extremo a extremo en navegador (`npm run test:e2e`, `tests/e2e/`).
- **I**: interoperabilidad con programas externos (`npm run test:interop`,
  `tests/interop/`): LibreOffice 24.2, python-docx 1.2, openpyxl 3.1.5 y
  python-pptx 1.0.2. Los archivos generados quedan en `tests/interop/.out/` para
  revisarlos a mano.

## Resumen

| Formato | Aplicación | Abrir | Guardar | Pruebas |
|---|---|---|---|---|
| DOCX | Scribe | ✅ | ✅ | U `docx.test.ts`; E `writer.spec.ts`; I python-docx → Scribe, Scribe → python-docx + LibreOffice |
| ODT | Scribe | 🟡 | 🟡 | I Scribe → LibreOffice y LibreOffice → Scribe |
| RTF | Scribe | 🟡 | 🟡 | I Scribe → LibreOffice y LibreOffice → Scribe |
| HTML · Markdown · TXT | Scribe | ✅ (HTML, TXT, MD) | ✅ | E `responsive.spec.ts` (TXT) |
| PDF (exportar) | Scribe · Grid · Stage | — | ✅ mediante «Imprimir → Guardar como PDF» | manual (diálogo del sistema) |
| DOC (Word 97-2003) | Scribe | ❌ en la aplicación | ❌ | I conversión con LibreOffice y apertura del DOCX resultante |
| XLSX | Grid | ✅ | ✅ | U `sheetsFormats.test.ts`; E `sheets.spec.ts`; I openpyxl ↔ Grid, recálculo comparado con LibreOffice |
| ODS | Grid | 🟡 | 🟡 | U `sheetsFormats.test.ts`; I Grid → LibreOffice y LibreOffice → Grid |
| CSV · TSV | Grid | ✅ | ✅ | U `sheetsFormats.test.ts`; E `sheets.spec.ts` |
| XLS (Excel 97-2003) | Grid | ❌ en la aplicación | ❌ | I conversión con LibreOffice |
| PPTX | Stage | ✅ | ✅ | U `pptx.test.ts`; E `slides.spec.ts`; I python-pptx → Stage, Stage → python-pptx + LibreOffice (PDF) |
| PNG | Stage | — | ✅ (todas las diapositivas en .zip) | manual |
| PPT (PowerPoint 97-2003) | Stage | ❌ en la aplicación | ❌ | I conversión con LibreOffice |
| PDF | Folio | ✅ | ✅ | U `pdfOps.test.ts`; E `pdf.spec.ts` |

## Rounded Scribe

### DOCX (Word)

**Se conserva al abrir y guardar:** párrafos y estilos de título, negrita,
cursiva, subrayado, tachado, superíndice/subíndice, fuente, tamaño, color,
resaltado, alineación, interlineado, sangrías y espaciado, listas con viñetas y
numeradas (con niveles), tablas (anchos, celdas combinadas, sombreado), imágenes
incrustadas (PNG, JPEG, GIF; WebP y SVG se convierten a PNG al exportar), hipervínculos, saltos de página, notas
al pie, índice, tamaño y orientación de página, márgenes, encabezado y pie de
página de texto con número de página.

**Se transforma (con aviso):**

- Cambios controlados: se aceptan las inserciones y eliminaciones.
- Varias secciones: se unifican en una (se pierden cambios de orientación o
  márgenes por sección).
- Cuadros de texto: pasan a texto normal.
- Ecuaciones: se importan como texto sin formato.

**No se importa (con aviso):** gráficos de Word, SmartArt, formas de dibujo,
objetos OLE, contenido `altChunk`, comentarios, imágenes en encabezados y pies,
imágenes vinculadas externamente (por privacidad) y formatos de imagen que el
navegador no puede mostrar (EMF/WMF, TIFF). Las macros se descartan siempre.

**Evidencia:** la prueba unitaria hace ida y vuelta Scribe → DOCX → Scribe con
estructura, formato, tablas, listas, imágenes, notas y página. La de
interoperabilidad crea un DOCX con python-docx (títulos, formato, tabla, lista,
imagen, orientación horizontal), lo abre en Scribe y comprueba el contenido; y
exporta desde Scribe, lo lee python-docx (estilos, tabla, orientación) y lo
convierte LibreOffice a PDF y texto.

### ODT y RTF (🟡)

- **ODT:** texto, títulos, formato de caracteres, alineación, listas, tablas
  (con celdas combinadas), imágenes, notas al pie y finales, tamaño y márgenes de
  página, encabezado y pie de texto. El índice se exporta como texto (lista de
  títulos), no como campo actualizable.
- **RTF:** texto, formato de caracteres, párrafos y alineación, tablas sencillas,
  imágenes PNG/JPEG, notas al pie, saltos de página y tamaño de página. El
  índice se exporta como texto; encabezados y pies no se conservan.
- En ambos casos se pierden estilos de documento avanzados (estilos con nombre
  propios, columnas, secciones múltiples).

### DOC binario

No hay ninguna biblioteca JavaScript de licencia permisiva que lea DOC con
calidad aceptable. La alternativa probada es convertir con LibreOffice:

```bash
soffice --headless --convert-to docx documento.doc
```

y abrir el DOCX resultante (la prueba de interoperabilidad lo hace con un DOC
generado por LibreOffice). La aplicación reconoce los archivos DOC/XLS/PPT y
muestra estas instrucciones en lugar de un error genérico.

## Rounded Grid

### XLSX (Excel)

**Se conserva:** valores, fórmulas (con su último resultado calculado), varias
hojas, estilos de celda (fuente, negrita, cursiva, subrayado, color, relleno,
bordes, alineación, ajuste de texto), formatos numéricos, celdas combinadas,
anchos de columna y altos de fila, filas/columnas inmovilizadas, validación de
datos (listas, números, fechas) y formato condicional (comparaciones, escalas de
color sencillas).

**Se transforma (con aviso):** tablas dinámicas → valores estáticos; hojas
ocultas → visibles; hipervínculos de celda → texto.

**No se admite (con aviso):** gráficos (ni al importar ni al exportar: ExcelJS
no los escribe; se conservan dentro de Rounded Grid y al imprimir), imágenes en
hojas, comentarios de celda, nombres definidos (las fórmulas que los usan
muestran `#NAME?`), reglas de validación personalizadas y tipos de formato
condicional avanzados (barras de datos, iconos). Las macros se descartan.

**Evidencia:** la prueba de interoperabilidad crea un libro con openpyxl con 20
fórmulas (aritmética, SUM, IF, ROUND/AVERAGE, VLOOKUP, SUMIF, COUNTIF con
comodines, MAX/MIN, CONCATENATE, referencia a otra hoja, DATE/YEAR/MONTH,
INDEX/MATCH, IFERROR, SUMPRODUCT, LEFT/UPPER/LEN, MOD/POWER/ABS, AND/OR), lo
recalcula con LibreOffice y comprueba que el motor de Grid da los mismos
resultados. Las funciones financieras y estadísticas se comprueban contra
valores de referencia en `formulas.test.ts`. En sentido inverso,
openpyxl lee fórmulas, valores y formato de un XLSX de Grid y LibreOffice lo
recalcula igual. La prueba e2e exporta desde el navegador y verifica el archivo
con ExcelJS.

### ODS (🟡)

Valores, fórmulas (convertidas entre OpenFormula y la sintaxis de Excel),
varias hojas, estilos básicos, celdas combinadas y anchos. No se exportan
gráficos, formato condicional ni validación (con aviso). Al importar se avisa
de macros y objetos incrustados no admitidos.

### CSV y TSV

Detección automática de separador (coma, punto y coma, tabulador) y de decimales
europeos (`1.234,56`), lectura de UTF-8 (con o sin BOM) y Windows-1252,
conservación de ceros a la izquierda en códigos. Exportación a CSV con comas, a
CSV con punto y coma para Excel en español (con BOM) y a TSV.

### Motor de fórmulas

Unas 150 funciones con nombres en inglés y español, separador `,` o `;`,
referencias relativas, absolutas, mixtas y entre hojas, rangos completos de
columna, errores de Excel (`#DIV/0!`, `#N/A`, `#REF!`, `#VALUE!`, `#NAME?`,
`#NUM!`) más `#CIRC!` para referencias circulares. Recálculo incremental por
grafo de dependencias, sin recursión (cadenas de dependencias largas no
desbordan la pila). Funciones no implementadas devuelven `#NAME?` en lugar de un
resultado inventado. Fórmulas matriciales dinámicas y funciones de cubo: no
admitidas.

## Rounded Stage

### PPTX (PowerPoint)

**Se conserva:** diapositivas, tamaño (16:9, 4:3), fondos (color e imagen),
cuadros de texto con formato (fuente, tamaño, color, negrita, cursiva,
subrayado, alineación, viñetas), formas predefinidas (rectángulo, redondeado,
elipse, triángulo, flechas, estrella, etc.) con relleno, borde y texto, líneas y
flechas, imágenes, tablas, rotación, notas del orador y diapositivas ocultas.

**Al importar** se leen además los colores del tema y los marcadores de
posición heredados del patrón y del diseño, y los grupos de formas se
desagrupan. Con aviso: formas personalizadas → rectángulos; formas preestablecidas
poco comunes → aproximadas; degradados → color sólido; celdas combinadas de
tablas → separadas.

**No se admite (con aviso):** gráficos de PowerPoint, SmartArt, objetos OLE,
vídeo y audio, animaciones de PowerPoint al importar, y animaciones y
transiciones de Stage al exportar (se conservan dentro de Stage y en su modo
presentación). Las macros se descartan.

**Evidencia:** ida y vuelta unitaria con todos los tipos de elemento;
python-pptx crea una presentación (título, viñetas, forma, imagen, tabla, notas)
que Stage importa; un PPTX de Stage lo leen python-pptx y LibreOffice, que lo
convierte a PDF. La prueba e2e exporta desde el navegador y revisa el paquete.

## Rounded Folio (PDF)

- **Abrir:** cualquier PDF que PDF.js pueda mostrar, con texto seleccionable y
  búsqueda. Los PDF cifrados con contraseña de apertura piden la contraseña;
  los formularios se muestran pero no se rellenan.
- **Operaciones:** girar, reordenar, eliminar, insertar otro PDF (combinar) y
  extraer páginas (dividir), con pdf-lib. Las anotaciones siguen a su página al
  reordenar.
- **Anotaciones:** resaltado, tachado, recuadro, nota y texto libre. Se guardan
  aparte y se **incrustan como contenido** de la página al descargar o imprimir
  (no como anotaciones PDF editables en otros lectores).
- **No admitido:** editar el texto original del PDF, firmar, OCR, rellenar
  formularios.

**Evidencia:** pruebas unitarias de cada operación y de la incrustación; la e2e
abre un PDF de tres páginas, busca, anota, gira, elimina una página, recarga y
comprueba el PDF descargado (número de páginas, rotación y contenido añadido).
