import type { TemplateDef } from '../types';
import { bold, colored, createEmptyDocument, footnote, h, hr, ol, p, pageBreak, t, table, toc, ul, type WriterContent } from '@/modules/writer/model';

export const templates: TemplateDef<WriterContent>[] = [
  {
    id: 'doc-informe-empresa',
    kind: 'document',
    name: 'Informe empresarial',
    category: 'Informes',
    description: 'Informe con portada, índice automático, resumen ejecutivo, análisis y conclusiones.',
    documentName: 'Informe',
    build: () => {
      const c = createEmptyDocument({
        type: 'doc',
        content: [
          p(),
          p(),
          p([t('INFORME DE RESULTADOS', [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '28pt', color: '#0f766e' } }])], { textAlign: 'center' }),
          p([t('Primer semestre', [{ type: 'textStyle', attrs: { fontSize: '16pt', color: '#475569' } }])], { textAlign: 'center' }),
          p(),
          p('Preparado por: Departamento de Análisis', { textAlign: 'center' }),
          p(new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' }), { textAlign: 'center' }),
          pageBreak(),
          toc(),
          pageBreak(),
          h(1, '1. Resumen ejecutivo'),
          p([t('Los ingresos crecieron un '), bold('12 %'), t(' respecto al periodo anterior'), footnote('Datos provisionales a cierre de junio.'), t(', impulsados por los nuevos clientes del canal digital.')]),
          ul(['Ingresos: 1,2 M€ (+12 %)', 'Margen bruto: 41 %', 'Clientes activos: 3.450']),
          h(1, '2. Análisis'),
          h(2, '2.1 Ventas por región'),
          table([['Región', 'Ventas (€)', 'Variación'], ['Norte', '420.000', '+8 %'], ['Centro', '510.000', '+15 %'], ['Sur', '270.000', '+11 %']], { header: true }),
          h(2, '2.2 Riesgos identificados'),
          ol(['Dependencia de un proveedor principal.', 'Estacionalidad en el tercer trimestre.']),
          h(1, '3. Conclusiones y recomendaciones'),
          p('Recomendamos reforzar la inversión en el canal digital y diversificar proveedores antes del cierre del año.'),
        ],
      });
      c.page.footer = { text: 'Página {page} de {pages}', align: 'center' };
      c.page.header = { text: 'Informe de resultados — Confidencial', align: 'right' };
      c.page.differentFirstPage = true;
      return c;
    },
  },
  {
    id: 'doc-propuesta',
    kind: 'document',
    name: 'Propuesta comercial',
    category: 'Empresa',
    description: 'Propuesta de servicios con alcance, calendario, inversión y condiciones.',
    documentName: 'Propuesta comercial',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          h(1, [colored('Propuesta de servicios', '#7c3aed')]),
          p([bold('Cliente: '), t('Empresa Cliente S.L.')]),
          p([bold('Fecha: '), t(new Date().toLocaleDateString('es'))]),
          hr(),
          h(2, 'Contexto'),
          p('Describe la situación actual del cliente y la necesidad que motiva esta propuesta.'),
          h(2, 'Objetivos'),
          ul(['Objetivo medible 1', 'Objetivo medible 2', 'Objetivo medible 3']),
          h(2, 'Alcance y entregables'),
          table([['Fase', 'Entregable', 'Duración'], ['Análisis', 'Informe de situación', '2 semanas'], ['Diseño', 'Propuesta de solución', '3 semanas'], ['Implantación', 'Solución en producción', '6 semanas']], { header: true }),
          h(2, 'Inversión'),
          table([['Concepto', 'Importe'], ['Servicios profesionales', '12.000 €'], ['Licencias', '0 € (software libre)'], ['Total (IVA no incluido)', '12.000 €']], { header: true }),
          h(2, 'Condiciones'),
          ul(['Validez de la oferta: 30 días.', 'Forma de pago: 40 % al inicio, 60 % a la entrega.']),
          p(),
          p('Aceptación del cliente: ______________________'),
        ],
      }),
  },
  {
    id: 'doc-acta',
    kind: 'document',
    name: 'Acta de reunión',
    category: 'Planificación',
    description: 'Acta con asistentes, orden del día, acuerdos y tareas asignadas.',
    documentName: 'Acta de reunión',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          h(1, 'Acta de reunión'),
          table([['Fecha', new Date().toLocaleDateString('es')], ['Hora', '10:00 – 11:00'], ['Lugar', 'Sala 2 / videollamada'], ['Redacta', 'Nombre']]),
          h(2, 'Asistentes'),
          ul(['Persona 1 (área)', 'Persona 2 (área)', 'Persona 3 (área)']),
          h(2, 'Orden del día'),
          ol(['Revisión de acuerdos anteriores', 'Estado del proyecto', 'Ruegos y preguntas']),
          h(2, 'Acuerdos'),
          ol(['Acuerdo 1', 'Acuerdo 2']),
          h(2, 'Tareas'),
          table([['Tarea', 'Responsable', 'Fecha límite'], ['', '', ''], ['', '', '']], { header: true }),
          h(2, 'Próxima reunión'),
          p('Fecha y hora por confirmar.'),
        ],
      }),
  },
];
