import type { TemplateDef } from '../types';
import { bold, colored, createEmptyDocument, h, hr, p, t, table, ul, type WriterContent } from '@/modules/writer/model';

const accent = '#1d4ed8';

export const templates: TemplateDef<WriterContent>[] = [
  {
    id: 'doc-cv-moderno',
    kind: 'document',
    name: 'Currículum moderno',
    category: 'Currículums',
    description: 'Currículum de una página con perfil, experiencia, formación y competencias.',
    documentName: 'Currículum',
    build: () => {
      const c = createEmptyDocument({
        type: 'doc',
        content: [
          h(1, [colored('Nombre Apellido', accent)]),
          p([t('Diseñadora de producto · Madrid · '), t('nombre@correo.com', [{ type: 'link', attrs: { href: 'mailto:nombre@correo.com' } }]), t(' · +34 600 000 000')]),
          hr(),
          h(2, [colored('Perfil', accent)]),
          p('Profesional con 6 años de experiencia creando productos digitales centrados en las personas. Me motiva resolver problemas complejos con soluciones simples y medibles.'),
          h(2, [colored('Experiencia', accent)]),
          h(3, 'Diseñadora de producto sénior — Empresa Ejemplo'),
          p([t('2021 – actualidad', [{ type: 'italic' }])]),
          ul(['Lideré el rediseño del proceso de compra, con un aumento del 18 % en la conversión.', 'Creé y mantuve el sistema de diseño utilizado por 4 equipos.', 'Coordiné investigaciones con más de 60 usuarios.']),
          h(3, 'Diseñadora UX — Estudio Creativo'),
          p([t('2018 – 2021', [{ type: 'italic' }])]),
          ul(['Diseñé aplicaciones móviles para clientes de banca y salud.', 'Facilité talleres de co-creación con clientes.']),
          h(2, [colored('Formación', accent)]),
          p([bold('Grado en Diseño Multimedia'), t(' — Universidad Ejemplo (2014 – 2018)')]),
          h(2, [colored('Competencias', accent)]),
          table([['Diseño', 'Investigación, prototipado, accesibilidad'], ['Herramientas', 'Rounded Desktop, editores vectoriales, analítica'], ['Idiomas', 'Español (nativo), inglés (C1), francés (B1)']]),
        ],
      });
      c.page.margins = { top: 18, right: 20, bottom: 18, left: 20 };
      return c;
    },
  },
  {
    id: 'doc-cv-clasico',
    kind: 'document',
    name: 'Currículum clásico',
    category: 'Currículums',
    description: 'Formato tradicional y sobrio, ideal para administraciones y sectores formales.',
    documentName: 'Currículum vitae',
    build: () => {
      const c = createEmptyDocument({
        type: 'doc',
        content: [
          p([t('CURRÍCULUM VITAE', [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '18pt' } }])], { textAlign: 'center' }),
          p([t('Nombre Apellido Apellido', [{ type: 'bold' }])], { textAlign: 'center' }),
          p('Dirección · Ciudad · Teléfono · Correo electrónico', { textAlign: 'center' }),
          h(2, 'Datos personales'),
          table([['Fecha de nacimiento', '01/01/1990'], ['Nacionalidad', 'Española'], ['Permiso de conducir', 'B']]),
          h(2, 'Formación académica'),
          ul(['2012 – 2016: Licenciatura en Administración y Dirección de Empresas. Universidad Ejemplo.', '2016 – 2017: Máster en Gestión Pública. Universidad Ejemplo.']),
          h(2, 'Experiencia profesional'),
          ul(['2017 – actualidad: Técnico de administración. Organismo Ejemplo.', '2016 – 2017: Prácticas en el departamento financiero. Empresa Ejemplo.']),
          h(2, 'Idiomas'),
          ul(['Inglés: nivel B2 (certificado oficial).', 'Francés: nivel A2.']),
          h(2, 'Informática'),
          p('Procesadores de texto, hojas de cálculo y presentaciones (nivel avanzado).'),
        ],
      });
      c.styles = { body: { fontFamily: 'Times New Roman', fontSize: 12 } };
      return c;
    },
  },
];
