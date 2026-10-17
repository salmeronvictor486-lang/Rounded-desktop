import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'rounded-desktop:theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* almacenamiento no disponible */
  }
  return 'system';
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16161d' : '#f7f7fb');
}

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: readPref(),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignorar */
    }
    apply(pref);
    set({ pref });
  },
}));

export function initTheme() {
  apply(useTheme.getState().pref);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => apply(useTheme.getState().pref));
}
