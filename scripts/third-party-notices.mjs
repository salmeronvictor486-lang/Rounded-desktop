// Genera THIRD_PARTY_NOTICES.md a partir de las dependencias de producción instaladas.
// Uso: npm run notices
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

/** Paquetes sin campo `license` en su package.json: licencia comprobada a mano en su repositorio. */
const MANUAL = { buffers: 'Sin declarar' };
const MANUAL_NOTES = { buffers: 'no declara licencia. Es una dependencia solo de Node (ExcelJS → unzipper → binary → buffers) que no llega al paquete del navegador, porque la aplicación usa la compilación para navegador de ExcelJS.' };

/** Elecciones en licencias duales o compuestas. */
const CHOICES = {
  jszip: 'Se usa bajo la opción MIT.',
  dompurify: 'Se usa bajo la opción Apache-2.0.',
  pako: 'MIT con partes derivadas de zlib (licencia Zlib).',
};

/** Código que se publica en dist/ sin ser dependencia de producción (lo genera el empaquetador). */
const EXTRA = ['workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies', 'workbox-window'];

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ');
  return MANUAL[pkg.name] ?? 'Sin declarar';
}

function repoOf(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = (r ?? pkg.homepage ?? '').replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url;
}

function noticeFile(dir) {
  const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i.test(n));
  return f ? join(dir, f) : null;
}

const out = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' });
const dirs = new Set(out.split('\n').slice(1).filter(Boolean));
for (const name of EXTRA) {
  const d = join(root, 'node_modules', name);
  if (existsSync(d)) dirs.add(d);
}

const pkgs = new Map();
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (pkgs.has(key)) continue;
  pkgs.set(key, { name: pkg.name, version: pkg.version, license: licenseOf(pkg), repo: repoOf(pkg), file: noticeFile(dir), dir });
}
const list = [...pkgs.values()].sort((a, b) => a.name.localeCompare(b.name));

const counts = {};
for (const p of list) counts[p.license] = (counts[p.license] ?? 0) + 1;

const direct = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies);

let md = `# Avisos de terceros

Rounded Desktop incluye software de terceros. Este archivo lo genera
\`npm run notices\` a partir de las dependencias de producción instaladas (más el
código de Workbox que el empaquetador añade al *service worker*); no lo edites a
mano. Las herramientas de desarrollo y pruebas (Vite, TypeScript, Vitest,
Playwright, ESLint…) no se distribuyen con la aplicación y no aparecen aquí.
La lista es deliberadamente amplia: incluye dependencias que solo se usan en Node
y que el empaquetador no incorpora al código del navegador.

Paquetes: **${list.length}**. Licencias: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ')}.

Ninguna dependencia distribuida tiene licencia copyleft obligatoria: JSZip ofrece
MIT o GPL-3.0 y se usa bajo MIT; DOMPurify ofrece MPL-2.0 o Apache-2.0 y se usa
bajo Apache-2.0. Los programas que usan las pruebas de interoperabilidad
(LibreOffice, python-docx, openpyxl, python-pptx) se ejecutan aparte y no se
incluyen.

## Dependencias directas

| Paquete | Versión | Licencia | Uso | Repositorio |
|---|---|---|---|---|
`;

const USE = {
  react: 'Interfaz', 'react-dom': 'Interfaz', zustand: 'Estado de la interfaz', 'lucide-react': 'Iconos',
  docx: 'Exportar DOCX', exceljs: 'Leer y escribir XLSX', pptxgenjs: 'Exportar PPTX', 'pdfjs-dist': 'Mostrar PDF',
  'pdf-lib': 'Modificar PDF', jszip: 'Leer y escribir ZIP (DOCX, ODT, ODS, PPTX)', papaparse: 'CSV', dompurify: 'Saneado de HTML',
  'html-to-image': 'Exportar diapositivas a PNG', idb: 'Almacenamiento IndexedDB',
};
for (const name of direct) {
  const p = list.find((x) => x.name === name);
  if (!p) continue;
  const use = USE[name] ?? (name.startsWith('@tiptap/') ? 'Editor de texto (TipTap/ProseMirror)' : '');
  md += `| ${p.name} | ${p.version} | ${p.license} | ${use} | ${p.repo} |\n`;
}

md += `\n## Notas de licencia\n\n`;
for (const [name, note] of Object.entries(CHOICES)) md += `- **${name}**: ${note}\n`;
for (const [name, note] of Object.entries(MANUAL_NOTES)) md += `- **${name}**: ${note}\n`;

md += `\n## Lista completa\n\n| Paquete | Versión | Licencia | Repositorio |\n|---|---|---|---|\n`;
for (const p of list) md += `| ${p.name} | ${p.version} | ${p.license} | ${p.repo} |\n`;

md += `\n## Textos de licencia\n\nTextos incluidos por cada paquete (se omiten los repetidos idénticos y los paquetes que no incluyen archivo de licencia; su licencia es la indicada en la tabla).\n`;
const seen = new Map();
for (const p of list) {
  if (!p.file) continue;
  const text = readFileSync(p.file, 'utf8').trim();
  if (seen.has(text)) {
    seen.get(text).push(`${p.name}@${p.version}`);
    continue;
  }
  seen.set(text, [`${p.name}@${p.version}`]);
}
for (const [text, names] of seen) {
  md += `\n### ${names.join(', ')}\n\n\`\`\`text\n${text.replace(/```/g, "'''")}\n\`\`\`\n`;
}

writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), md);
console.log(`THIRD_PARTY_NOTICES.md: ${list.length} paquetes`);
