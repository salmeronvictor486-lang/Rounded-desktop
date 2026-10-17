import type { Theme } from './model';

/** Temas originales de Rounded Stage. */
export const THEMES: Theme[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    colors: { bg: '#ffffff', text: '#1f2937', title: '#111827', accent: ['#4f46e5', '#06b6d4', '#f59e0b', '#10b981'] },
    fonts: { heading: 'Inter, "Segoe UI", Arial, sans-serif', body: 'Inter, "Segoe UI", Arial, sans-serif' },
    background: { type: 'solid', color: '#ffffff' },
  },
  {
    id: 'medianoche',
    name: 'Medianoche',
    colors: { bg: '#0f172a', text: '#e2e8f0', title: '#ffffff', accent: ['#818cf8', '#22d3ee', '#fbbf24', '#34d399'] },
    fonts: { heading: '"Segoe UI", Arial, sans-serif', body: '"Segoe UI", Arial, sans-serif' },
    background: { type: 'gradient', from: '#0f172a', to: '#1e1b4b', angle: 135 },
  },
  {
    id: 'terracota',
    name: 'Terracota',
    colors: { bg: '#fff7ed', text: '#431407', title: '#7c2d12', accent: ['#ea580c', '#b45309', '#0f766e', '#be123c'] },
    fonts: { heading: 'Georgia, "Times New Roman", serif', body: '"Segoe UI", Arial, sans-serif' },
    background: { type: 'solid', color: '#fff7ed' },
  },
  {
    id: 'bosque',
    name: 'Bosque',
    colors: { bg: '#f0fdf4', text: '#14532d', title: '#052e16', accent: ['#16a34a', '#0d9488', '#ca8a04', '#2563eb'] },
    fonts: { heading: '"Trebuchet MS", Arial, sans-serif', body: '"Trebuchet MS", Arial, sans-serif' },
    background: { type: 'gradient', from: '#f0fdf4', to: '#dcfce7', angle: 180 },
  },
  {
    id: 'oceano',
    name: 'Océano',
    colors: { bg: '#eff6ff', text: '#1e3a8a', title: '#172554', accent: ['#2563eb', '#0891b2', '#7c3aed', '#db2777'] },
    fonts: { heading: 'Verdana, Arial, sans-serif', body: 'Verdana, Arial, sans-serif' },
    background: { type: 'gradient', from: '#eff6ff', to: '#e0f2fe', angle: 160 },
  },
  {
    id: 'grafito',
    name: 'Grafito',
    colors: { bg: '#18181b', text: '#d4d4d8', title: '#fafafa', accent: ['#f43f5e', '#a78bfa', '#facc15', '#2dd4bf'] },
    fonts: { heading: 'Arial, Helvetica, sans-serif', body: 'Arial, Helvetica, sans-serif' },
    background: { type: 'solid', color: '#18181b' },
  },
  {
    id: 'pizarra',
    name: 'Pizarra escolar',
    colors: { bg: '#1f3a2c', text: '#f1f5f9', title: '#fef9c3', accent: ['#fde047', '#fb7185', '#93c5fd', '#86efac'] },
    fonts: { heading: '"Comic Sans MS", "Segoe Print", cursive', body: '"Trebuchet MS", Arial, sans-serif' },
    background: { type: 'solid', color: '#1f3a2c' },
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    colors: { bg: '#fafafa', text: '#3f3f46', title: '#09090b', accent: ['#09090b', '#71717a', '#e11d48', '#0ea5e9'] },
    fonts: { heading: 'Georgia, serif', body: 'Helvetica, Arial, sans-serif' },
    background: { type: 'solid', color: '#fafafa' },
  },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
