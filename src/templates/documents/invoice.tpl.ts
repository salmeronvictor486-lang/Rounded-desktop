import type { TemplateDef } from '../types';
import { bold, colored, createEmptyDocument, h, hr, p, t, table, type WriterContent } from '@/modules/writer/model';

export const templates: TemplateDef<WriterContent>[] = [
  {
    id: 'doc-factura',
    kind: 'document',
    name: 'Factura (documento)',
    category: 'Facturas y presupuestos',
    description: 'Factura imprimible con datos fiscales, conceptos y totales. Para cálculos automáticos usa la plantilla de Grid.',
    documentName: 'Factura',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          table([[[bold('Tu Empresa S.L.')], [t('FACTURA', [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '22pt', color: '#0f766e' } }])]], ['NIF: B00000000 · Calle Ejemplo 1, Ciudad', 'Nº 2025-001 · Fecha: ' + new Date().toLocaleDateString('es')]]),
          hr(),
          h(3, 'Facturar a'),
          p('Nombre del cliente · NIF · Dirección'),
          table([['Descripción', 'Cantidad', 'Precio', 'Importe'], ['Servicio de consultoría', '10 h', '50,00 €', '500,00 €'], ['Diseño de materiales', '1', '300,00 €', '300,00 €'], ['', '', 'Base imponible', '800,00 €'], ['', '', 'IVA (21 %)', '168,00 €'], ['', '', [bold('Total')], [bold('968,00 €')]]], { header: true }),
          p(),
          p([colored('Forma de pago: transferencia a ES00 0000 0000 0000 0000 0000', '#475569')]),
          p([colored('Gracias por su confianza.', '#475569')]),
        ],
      }),
  },
  {
    id: 'doc-presupuesto',
    kind: 'document',
    name: 'Presupuesto',
    category: 'Facturas y presupuestos',
    description: 'Presupuesto detallado con validez y condiciones.',
    documentName: 'Presupuesto',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          h(1, 'Presupuesto'),
          p([bold('Nº: '), t('P-2025-014   '), bold('Fecha: '), t(new Date().toLocaleDateString('es'))]),
          p([bold('Cliente: '), t('Nombre del cliente')]),
          table([['Concepto', 'Unidades', 'Precio unitario', 'Total'], ['Partida 1', '1', '1.000 €', '1.000 €'], ['Partida 2', '2', '250 €', '500 €'], ['', '', 'Total (sin IVA)', '1.500 €']], { header: true }),
          h(3, 'Condiciones'),
          p('Presupuesto válido durante 30 días. Plazo de ejecución estimado: 4 semanas desde la aceptación.'),
          p('Firma y fecha de aceptación:'),
        ],
      }),
  },
];
