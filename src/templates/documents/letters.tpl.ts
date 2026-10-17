import type { TemplateDef } from '../types';
import { bold, createEmptyDocument, p, t, type WriterContent } from '@/modules/writer/model';

const today = () => new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

export const templates: TemplateDef<WriterContent>[] = [
  {
    id: 'doc-carta-presentacion',
    kind: 'document',
    name: 'Carta de presentación',
    category: 'Cartas',
    description: 'Carta para acompañar tu currículum en una candidatura.',
    documentName: 'Carta de presentación',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          p([bold('Nombre Apellido')]),
          p('Ciudad · nombre@correo.com · +34 600 000 000'),
          p(),
          p(`Ciudad, ${today()}`, { textAlign: 'right' }),
          p([bold('Departamento de Selección')]),
          p('Empresa Ejemplo'),
          p(),
          p([t('Asunto: ', [{ type: 'bold' }]), t('Candidatura al puesto de [puesto]')]),
          p('Estimado equipo:'),
          p('Me dirijo a ustedes para presentar mi candidatura al puesto de [puesto] publicado en [medio]. Mi experiencia en [área] y mi interés por [motivo] encajan con los objetivos de su empresa.', { textAlign: 'justify' }),
          p('En mi puesto actual he [logro concreto con datos]. Además, [otra competencia relevante]. Estoy convencido de que puedo aportar [valor] a su equipo.', { textAlign: 'justify' }),
          p('Quedo a su disposición para ampliar cualquier información en una entrevista. Gracias por su tiempo y consideración.', { textAlign: 'justify' }),
          p('Atentamente,'),
          p(),
          p([bold('Nombre Apellido')]),
        ],
      }),
  },
  {
    id: 'doc-carta-formal',
    kind: 'document',
    name: 'Carta formal',
    category: 'Cartas',
    description: 'Modelo de carta formal con remitente, destinatario, asunto y firma.',
    documentName: 'Carta',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          p('Remitente'),
          p('Dirección'),
          p('Código postal y ciudad'),
          p(),
          p('Destinatario', { textAlign: 'right' }),
          p('Dirección', { textAlign: 'right' }),
          p('Código postal y ciudad', { textAlign: 'right' }),
          p(),
          p(`En Ciudad, a ${today()}`, { textAlign: 'right' }),
          p([t('Asunto: ', [{ type: 'bold' }]), t('Escribe aquí el motivo de la carta')]),
          p('Muy señores míos:'),
          p('Escribe aquí el cuerpo de la carta. Expón el motivo de forma clara y ordenada, aportando los datos necesarios.', { textAlign: 'justify', firstLineIndent: 47 }),
          p('Sin otro particular, reciban un cordial saludo.', { textAlign: 'justify', firstLineIndent: 47 }),
          p(),
          p('Firma', { textAlign: 'center' }),
        ],
      }),
  },
];
