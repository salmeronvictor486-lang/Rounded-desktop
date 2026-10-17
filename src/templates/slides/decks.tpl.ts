import type { TemplateDef } from '../types';
import { createSlide } from '@/modules/slides/layouts';
import { THEMES } from '@/modules/slides/themes';
import { newId, textDoc, type Presentation, type SlideElement } from '@/modules/slides/model';

function deck(themeId: string, slides: [Parameters<typeof createSlide>[0], Parameters<typeof createSlide>[2]][], notes: string[] = [], extra?: (p: Presentation) => void): Presentation {
  const theme = structuredClone(THEMES.find((t) => t.id === themeId) ?? THEMES[0]);
  const base = { theme, size: { width: 960, height: 540 } };
  const p: Presentation = { format: 'rounded-stage', version: 1, ...base, slides: slides.map(([layout, content], i) => ({ ...createSlide(layout, base, content), notes: notes[i] ?? '' })) };
  extra?.(p);
  return p;
}

function statCards(p: Presentation, slideIndex: number, stats: [string, string][]) {
  const t = p.theme.colors;
  const w = 240;
  const gap = 30;
  const x0 = (960 - (stats.length * w + (stats.length - 1) * gap)) / 2;
  stats.forEach(([value, label], i) => {
    const els: SlideElement[] = [
      { id: newId(), type: 'shape', shape: 'roundRect', x: x0 + i * (w + gap), y: 190, w, h: 200, rotation: 0, fill: t.accent[i % t.accent.length], stroke: null, strokeWidth: 0, vAlign: 'middle', content: textDoc([{ text: value, size: 54, bold: true, color: '#ffffff', align: 'center' }, { text: label, size: 18, color: '#ffffff', align: 'center' }]) },
    ];
    p.slides[slideIndex].elements.push(...els);
  });
}

export const templates: TemplateDef<Presentation>[] = [
  {
    id: 'slides-empresa',
    kind: 'presentation',
    name: 'Presentación empresarial',
    category: 'Empresa',
    description: 'Propuesta de valor, problema, solución, mercado, cifras clave y próximos pasos.',
    documentName: 'Presentación empresarial',
    build: () =>
      deck(
        'aurora',
        [
          ['title', { title: 'Nombre de la empresa', subtitle: 'Propuesta para inversores · 2025' }],
          ['titleContent', { title: 'El problema', body: ['Los equipos pierden horas buscando documentos', 'Las herramientas actuales son caras', 'La información está dispersa'] }],
          ['titleContent', { title: 'Nuestra solución', body: ['Una plataforma única y sencilla', 'Sin coste de licencias', 'Privacidad por diseño'] }],
          ['titleOnly', { title: 'Cifras clave' }],
          ['twoContent', { title: 'Mercado y competencia', body: ['Mercado de 4.000 M€', 'Crecimiento anual del 12 %'], body2: ['Competidores caros', 'Poca personalización'] }],
          ['section', { title: 'Próximos pasos', subtitle: 'Ronda de financiación y expansión' }],
        ],
        ['Presentación breve del equipo.', 'Cuenta una historia real de un cliente.', '', 'Destaca la cifra más llamativa.', '', 'Cierra con la petición concreta.'],
        (p) => statCards(p, 3, [['+120', 'clientes'], ['98 %', 'satisfacción'], ['3×', 'más rápido']]),
      ),
  },
  {
    id: 'slides-tecnologia',
    kind: 'presentation',
    name: 'Lanzamiento tecnológico',
    category: 'Tecnología',
    description: 'Presentación oscura para productos y demos técnicas: arquitectura, características y hoja de ruta.',
    documentName: 'Lanzamiento de producto',
    build: () =>
      deck('medianoche', [
        ['title', { title: 'Producto 2.0', subtitle: 'Más rápido. Más seguro. Abierto.' }],
        ['titleContent', { title: 'Novedades', body: ['Rendimiento 3 veces superior', 'Cifrado de extremo a extremo', 'Nueva API pública'] }],
        ['twoContent', { title: 'Arquitectura', body: ['Cliente local-first', 'Sincronización opcional'], body2: ['Almacenamiento cifrado', 'Código abierto'] }],
        ['quote', { title: '“La mejor tecnología es la que no se nota.”', subtitle: '— Equipo de producto' }],
        ['titleContent', { title: 'Hoja de ruta', body: ['T1: beta pública', 'T2: aplicación de escritorio', 'T3: colaboración en tiempo real'] }],
      ]),
  },
  {
    id: 'slides-clase',
    kind: 'presentation',
    name: 'Clase o formación',
    category: 'Educación',
    description: 'Estructura didáctica: objetivos, contenidos, actividad, resumen y evaluación.',
    documentName: 'Presentación de clase',
    build: () =>
      deck('pizarra', [
        ['title', { title: 'Tema 3: El ciclo del agua', subtitle: 'Ciencias Naturales · 2.º ESO' }],
        ['titleContent', { title: 'Objetivos de la sesión', body: ['Comprender las fases del ciclo', 'Relacionarlo con el clima', 'Valorar el uso responsable del agua'] }],
        ['imageText', { title: 'Evaporación', body: ['El sol calienta el agua de mares y ríos, que asciende en forma de vapor.'] }],
        ['titleContent', { title: 'Actividad', body: ['Por parejas: dibujad el ciclo', 'Señalad cada fase con flechas', 'Tiempo: 10 minutos'] }],
        ['titleContent', { title: 'Resumen', body: ['Evaporación', 'Condensación', 'Precipitación', 'Escorrentía'] }],
      ]),
  },
  {
    id: 'slides-proyecto',
    kind: 'presentation',
    name: 'Estado del proyecto',
    category: 'Proyectos',
    description: 'Informe de situación: avances, indicadores, riesgos, decisiones y siguientes hitos.',
    documentName: 'Estado del proyecto',
    build: () =>
      deck(
        'oceano',
        [
          ['title', { title: 'Proyecto Atlas', subtitle: 'Informe de estado · Semana 12' }],
          ['titleOnly', { title: 'Indicadores' }],
          ['twoContent', { title: 'Avances y bloqueos', body: ['Diseño cerrado', 'API al 80 %'], body2: ['Pendiente de proveedor', 'Falta validar seguridad'] }],
          ['titleContent', { title: 'Riesgos', body: ['Retraso del proveedor (alto)', 'Rotación del equipo (medio)'] }],
          ['titleContent', { title: 'Siguientes hitos', body: ['Pruebas de aceptación: 15 de noviembre', 'Puesta en producción: 1 de diciembre'] }],
        ],
        [],
        (p) => statCards(p, 1, [['72 %', 'avance'], ['4', 'semanas'], ['0', 'incidencias']]),
      ),
  },
  {
    id: 'slides-portfolio',
    kind: 'presentation',
    name: 'Portfolio creativo',
    category: 'Portfolios',
    description: 'Presenta tus proyectos con imágenes grandes, contexto y resultados.',
    documentName: 'Portfolio',
    build: () =>
      deck('minimal', [
        ['title', { title: 'Nombre Apellido', subtitle: 'Diseño · Fotografía · Dirección de arte' }],
        ['imageText', { title: 'Proyecto uno', body: ['Rediseño de identidad para una marca local. Aumento del 30 % en reconocimiento.'] }],
        ['imageText', { title: 'Proyecto dos', body: ['Campaña editorial para una revista independiente.'] }],
        ['quote', { title: '“Diseñar es decidir qué quitar.”', subtitle: '— Mi forma de trabajar' }],
        ['section', { title: 'Hablemos', subtitle: 'nombre@correo.com' }],
      ]),
  },
  {
    id: 'slides-academica',
    kind: 'presentation',
    name: 'Defensa académica (TFG/TFM)',
    category: 'Académico',
    description: 'Estructura para defender un trabajo: introducción, objetivos, metodología, resultados y conclusiones.',
    documentName: 'Defensa del trabajo',
    build: () =>
      deck('terracota', [
        ['title', { title: 'Título del trabajo de fin de grado', subtitle: 'Autor/a · Director/a · Universidad · Fecha' }],
        ['titleContent', { title: 'Introducción y justificación', body: ['Contexto del problema', 'Relevancia del estudio'] }],
        ['titleContent', { title: 'Objetivos', body: ['Objetivo general', 'Objetivos específicos'] }],
        ['twoContent', { title: 'Metodología', body: ['Diseño del estudio', 'Muestra'], body2: ['Instrumentos', 'Análisis'] }],
        ['titleContent', { title: 'Resultados', body: ['Resultado principal', 'Resultados secundarios'] }],
        ['titleContent', { title: 'Conclusiones', body: ['Respuesta a la pregunta de investigación', 'Limitaciones', 'Líneas futuras'] }],
        ['section', { title: 'Gracias', subtitle: 'Turno de preguntas' }],
      ]),
  },
];
