import { createSlide } from './layouts';
import { THEMES } from './themes';
import type { Presentation } from './model';

export function createPresentation(themeId = 'aurora'): Presentation {
  const theme = structuredClone(THEMES.find((t) => t.id === themeId) ?? THEMES[0]);
  const base = { theme, size: { width: 960, height: 540 } };
  return { format: 'rounded-stage', version: 1, ...base, slides: [createSlide('title', base)] };
}

export function normalizePresentation(p: Partial<Presentation> | null | undefined): Presentation {
  if (!p || !Array.isArray(p.slides)) return createPresentation();
  const def = createPresentation();
  return {
    format: 'rounded-stage',
    version: 1,
    size: p.size?.width && p.size?.height ? p.size : def.size,
    theme: p.theme ?? def.theme,
    slides: p.slides.length ? p.slides.map((s) => ({ ...s, elements: s.elements ?? [], notes: s.notes ?? '' })) : def.slides,
  };
}
