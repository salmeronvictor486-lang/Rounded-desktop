import type { TemplateDef } from '../types';
import type { Workbook } from '@/modules/sheets/model';
import { buildWorkbook, DATE, HEADER, PCT, TITLE } from './builder';

const today = Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000);

export const templates: TemplateDef<Workbook>[] = [
  {
    id: 'sheet-seguimiento-proyecto',
    kind: 'spreadsheet',
    name: 'Seguimiento de proyecto',
    category: 'Proyectos',
    description: 'Tareas con responsable, fechas, estado (lista desplegable), avance y alertas de retraso.',
    documentName: 'Seguimiento de proyecto',
    build: () =>
      buildWorkbook([
        {
          name: 'Tareas',
          rows: [
            ['Tarea', 'Responsable', 'Inicio', 'Fin', 'Estado', 'Avance', 'Días restantes'],
            ['Análisis de requisitos', 'Ana', today - 20, today - 10, 'Completada', 1, '=IF(E2="Completada","",D2-TODAY())'],
            ['Diseño', 'Luis', today - 9, today + 2, 'En curso', 0.7, '=IF(E3="Completada","",D3-TODAY())'],
            ['Desarrollo', 'Marta', today, today + 25, 'En curso', 0.2, '=IF(E4="Completada","",D4-TODAY())'],
            ['Pruebas', 'Jorge', today + 20, today + 35, 'Pendiente', 0, '=IF(E5="Completada","",D5-TODAY())'],
            ['Lanzamiento', 'Ana', today + 36, today + 38, 'Pendiente', 0, '=IF(E6="Completada","",D6-TODAY())'],
            [],
            [{ v: 'Avance global', s: { bold: true } }, null, null, null, null, { f: '=AVERAGE(F2:F6)', s: { bold: true, ...PCT } }],
            [{ v: 'Tareas completadas', s: { bold: true } }, null, null, null, null, { f: '=COUNTIF(E2:E6,"Completada")&" de "&COUNTA(A2:A6)', s: { bold: true } }],
          ],
          styles: [['A1:G1', HEADER], ['C2:D100', DATE], ['F2:F100', PCT]],
          widths: { A: 200, B: 110, C: 100, D: 100, E: 120, F: 90, G: 120 },
          freeze: { rows: 1, cols: 1 },
          filter: 'A1:G6',
          validations: [
            { range: 'E2:E100', type: 'list', values: ['Pendiente', 'En curso', 'Bloqueada', 'Completada'], allowBlank: true, strict: true },
            { range: 'F2:F100', type: 'number', values: ['0', '1'], allowBlank: true, strict: true, message: 'El avance debe estar entre 0 % y 100 %.' },
          ],
          conditional: [
            { range: 'E2:E100', type: 'eq', values: ['Completada'], style: { bg: '#dcfce7', color: '#166534' } },
            { range: 'E2:E100', type: 'eq', values: ['Bloqueada'], style: { bg: '#fee2e2', color: '#991b1b' } },
            { range: 'G2:G100', type: 'lt', values: ['0'], style: { color: '#dc2626', bold: true } },
            { range: 'F2:F100', type: 'colorScale', values: [], style: {}, colors: ['#fef3c7', '#22c55e'] },
          ],
        },
      ]),
  },
  {
    id: 'sheet-planificador-semanal',
    kind: 'spreadsheet',
    name: 'Planificador semanal',
    category: 'Planificación',
    description: 'Horario semanal por franjas de una hora, con colores para cada tipo de actividad.',
    documentName: 'Planificador semanal',
    build: () => {
      const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const rows: (string | number | null | { v?: string | number; s?: object })[][] = [[{ v: 'Planificador semanal', s: TITLE }], [], ['Hora', ...days]];
      for (let h = 8; h <= 21; h++) rows.push([{ v: h / 24, s: { numFmt: 'hh:mm', bold: true } }]);
      rows[3].push('Reunión equipo');
      rows[5].push(null, 'Clase', null, 'Clase');
      rows[11].push(null, null, null, null, null, 'Deporte');
      return buildWorkbook([
        {
          name: 'Semana',
          rows: rows as never,
          styles: [['A3:H3', HEADER], ['B4:H17', { wrap: true, vAlign: 'top' }]],
          widths: { A: 70, B: 120, C: 120, D: 120, E: 120, F: 120, G: 120, H: 120 },
          freeze: { rows: 3, cols: 1 },
          conditional: [
            { range: 'B4:H17', type: 'contains', values: ['Reunión'], style: { bg: '#dbeafe' } },
            { range: 'B4:H17', type: 'contains', values: ['Clase'], style: { bg: '#fef9c3' } },
            { range: 'B4:H17', type: 'contains', values: ['Deporte'], style: { bg: '#dcfce7' } },
          ],
        },
      ]);
    },
  },
  {
    id: 'sheet-calificaciones',
    kind: 'spreadsheet',
    name: 'Cuaderno de calificaciones',
    category: 'Educación',
    description: 'Notas por alumno con ponderación, media, calificación textual y estadísticas de clase.',
    documentName: 'Calificaciones',
    build: () =>
      buildWorkbook([
        {
          name: 'Notas',
          rows: [
            ['Alumno/a', 'Examen 1', 'Examen 2', 'Trabajo', 'Participación', 'Nota final', 'Calificación'],
            [{ v: 'Peso', s: { italic: true } }, { v: 0.3, s: PCT }, { v: 0.3, s: PCT }, { v: 0.3, s: PCT }, { v: 0.1, s: PCT }, { f: '=SUM(B2:E2)', s: PCT }],
            ['Alumno 1', 7.5, 8, 9, 10, '=ROUND(SUMPRODUCT(B3:E3,$B$2:$E$2),2)', '=IFS(F3>=9,"Sobresaliente",F3>=7,"Notable",F3>=6,"Bien",F3>=5,"Suficiente",TRUE,"Insuficiente")'],
            ['Alumno 2', 4, 5.5, 6, 8, '=ROUND(SUMPRODUCT(B4:E4,$B$2:$E$2),2)', '=IFS(F4>=9,"Sobresaliente",F4>=7,"Notable",F4>=6,"Bien",F4>=5,"Suficiente",TRUE,"Insuficiente")'],
            ['Alumno 3', 9.5, 9, 8.5, 9, '=ROUND(SUMPRODUCT(B5:E5,$B$2:$E$2),2)', '=IFS(F5>=9,"Sobresaliente",F5>=7,"Notable",F5>=6,"Bien",F5>=5,"Suficiente",TRUE,"Insuficiente")'],
            ['Alumno 4', 3, 4, 5, 6, '=ROUND(SUMPRODUCT(B6:E6,$B$2:$E$2),2)', '=IFS(F6>=9,"Sobresaliente",F6>=7,"Notable",F6>=6,"Bien",F6>=5,"Suficiente",TRUE,"Insuficiente")'],
            [],
            [{ v: 'Media de la clase', s: { bold: true } }, '=AVERAGE(B3:B6)', '=AVERAGE(C3:C6)', '=AVERAGE(D3:D6)', '=AVERAGE(E3:E6)', '=AVERAGE(F3:F6)'],
            [{ v: 'Aprobados', s: { bold: true } }, null, null, null, null, '=COUNTIF(F3:F6,">=5")'],
            [{ v: 'Nota máxima', s: { bold: true } }, null, null, null, null, '=MAX(F3:F6)'],
          ],
          styles: [['A1:G1', HEADER], ['B3:F8', { numFmt: '0.00', hAlign: 'center' }]],
          widths: { A: 160, G: 130 },
          freeze: { rows: 2, cols: 1 },
          validations: [{ range: 'B3:E100', type: 'number', values: ['0', '10'], allowBlank: true, strict: true, message: 'Las notas van de 0 a 10.' }],
          conditional: [
            { range: 'F3:F100', type: 'lt', values: ['5'], style: { bg: '#fee2e2', color: '#991b1b', bold: true } },
            { range: 'F3:F100', type: 'gte', values: ['9'], style: { bg: '#dcfce7', color: '#166534', bold: true } },
          ],
        },
      ]),
  },
  {
    id: 'sheet-inventario',
    kind: 'spreadsheet',
    name: 'Inventario',
    category: 'Empresa',
    description: 'Inventario con stock, stock mínimo, valor y alerta de reposición.',
    documentName: 'Inventario',
    build: () =>
      buildWorkbook([
        {
          name: 'Inventario',
          rows: [
            ['Código', 'Producto', 'Stock', 'Stock mínimo', 'Coste unitario', 'Valor', 'Reponer'],
            ['P-001', 'Cuaderno A4', 120, 50, 1.2, '=C2*E2', '=IF(C2<D2,"Sí","No")'],
            ['P-002', 'Bolígrafo azul', 35, 100, 0.35, '=C3*E3', '=IF(C3<D3,"Sí","No")'],
            ['P-003', 'Carpeta', 60, 40, 2.1, '=C4*E4', '=IF(C4<D4,"Sí","No")'],
            ['P-004', 'Grapadora', 8, 10, 6.5, '=C5*E5', '=IF(C5<D5,"Sí","No")'],
            [],
            [{ v: 'Valor total', s: { bold: true } }, null, null, null, null, { f: '=SUM(F2:F5)', s: { bold: true, numFmt: '#,##0.00 "€"' } }],
          ],
          styles: [['A1:G1', HEADER], ['E2:F100', { numFmt: '#,##0.00 "€"' }]],
          widths: { A: 80, B: 180, C: 80, D: 110, E: 120, F: 110, G: 80 },
          freeze: { rows: 1, cols: 0 },
          filter: 'A1:G5',
          conditional: [{ range: 'G2:G100', type: 'eq', values: ['Sí'], style: { bg: '#fee2e2', color: '#991b1b', bold: true } }],
        },
      ]),
  },
];
