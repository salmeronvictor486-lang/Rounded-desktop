import type { TemplateDef } from '../types';
import { bold, createEmptyDocument, footnote, h, ol, p, pageBreak, t, table, toc, ul, type WriterContent } from '@/modules/writer/model';

export const templates: TemplateDef<WriterContent>[] = [
  {
    id: 'doc-trabajo-academico',
    kind: 'document',
    name: 'Trabajo académico',
    category: 'Académico',
    description: 'Portada, índice automático, introducción, desarrollo, conclusiones y bibliografía con notas al pie.',
    documentName: 'Trabajo académico',
    build: () => {
      const c = createEmptyDocument({
        type: 'doc',
        content: [
          p([t('UNIVERSIDAD EJEMPLO', [{ type: 'bold' }])], { textAlign: 'center' }),
          p('Facultad de Ciencias Sociales', { textAlign: 'center' }),
          p(),
          p(),
          p([t('Título del trabajo', [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '24pt' } }])], { textAlign: 'center' }),
          p([t('Subtítulo del trabajo', [{ type: 'italic' }])], { textAlign: 'center' }),
          p(),
          p(),
          p([bold('Autor/a: '), t('Nombre Apellido')], { textAlign: 'right' }),
          p([bold('Asignatura: '), t('Nombre de la asignatura')], { textAlign: 'right' }),
          p([bold('Profesor/a: '), t('Nombre Apellido')], { textAlign: 'right' }),
          p([bold('Curso: '), t('2025-2026')], { textAlign: 'right' }),
          pageBreak(),
          toc(),
          pageBreak(),
          h(1, '1. Introducción'),
          p([t('Presenta el tema, la pregunta de investigación y la estructura del trabajo'), footnote('Puedes insertar notas al pie desde Insertar → Nota al pie.'), t('.')], { textAlign: 'justify', firstLineIndent: 47, lineHeight: 1.5 }),
          h(1, '2. Marco teórico'),
          p('Resume las principales aportaciones de otros autores sobre el tema.', { textAlign: 'justify', firstLineIndent: 47, lineHeight: 1.5 }),
          h(2, '2.1 Antecedentes'),
          p('Desarrolla los antecedentes relevantes.', { textAlign: 'justify', firstLineIndent: 47, lineHeight: 1.5 }),
          h(1, '3. Metodología'),
          table([['Fase', 'Técnica', 'Muestra'], ['Exploratoria', 'Revisión bibliográfica', '—'], ['Empírica', 'Encuesta', '120 participantes']], { header: true }),
          h(1, '4. Resultados y discusión'),
          p('Expón y analiza los resultados obtenidos.', { textAlign: 'justify', firstLineIndent: 47, lineHeight: 1.5 }),
          h(1, '5. Conclusiones'),
          p('Responde a la pregunta de investigación y señala líneas futuras.', { textAlign: 'justify', firstLineIndent: 47, lineHeight: 1.5 }),
          h(1, 'Bibliografía'),
          p('Apellido, N. (2020). Título del libro. Editorial.', { indent: 1, firstLineIndent: -47 }),
          p('Apellido, N. y Apellido, N. (2022). Título del artículo. Nombre de la revista, 12(3), 45-67.', { indent: 1, firstLineIndent: -47 }),
        ],
      });
      c.styles = { body: { fontFamily: 'Times New Roman', fontSize: 12 } };
      c.page.footer = { text: '{page}', align: 'center' };
      c.page.differentFirstPage = true;
      c.page.margins = { top: 25, right: 25, bottom: 25, left: 30 };
      return c;
    },
  },
  {
    id: 'doc-apuntes',
    kind: 'document',
    name: 'Apuntes de clase',
    category: 'Apuntes',
    description: 'Apuntes estructurados con conceptos clave, ejemplos, resumen y preguntas de repaso.',
    documentName: 'Apuntes',
    build: () =>
      createEmptyDocument({
        type: 'doc',
        content: [
          h(1, 'Tema 1: Título del tema'),
          p([bold('Asignatura: '), t('…   '), bold('Fecha: '), t(new Date().toLocaleDateString('es'))]),
          h(2, 'Conceptos clave'),
          ul([[t('Concepto 1: ', [{ type: 'bold' }]), t('definición breve.')], [t('Concepto 2: ', [{ type: 'bold' }]), t('definición breve.')]]),
          h(2, 'Desarrollo'),
          p('Explicación detallada del tema, con tus propias palabras.'),
          { type: 'blockquote', content: [p('Idea importante o cita del profesor.')] },
          h(2, 'Ejemplo'),
          { type: 'codeBlock', content: [{ type: 'text', text: 'Ejemplo, fórmula o fragmento de código' }] },
          h(2, 'Resumen'),
          ol(['Primera idea', 'Segunda idea', 'Tercera idea']),
          h(2, 'Preguntas de repaso'),
          ol(['¿Pregunta 1?', '¿Pregunta 2?']),
        ],
      }),
  },
];
