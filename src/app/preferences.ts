import { create } from 'zustand';

interface Prefs {
  spellcheck: boolean;
  spellLang: string;
}

const KEY = 'rounded-desktop:prefs';

function load(): Prefs {
  const defaults: Prefs = { spellcheck: true, spellLang: (typeof navigator !== 'undefined' && navigator.language?.slice(0, 2)) || 'es' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export const usePreferences = create<Prefs & { set: (p: Partial<Prefs>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { spellcheck, spellLang } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ spellcheck, spellLang }));
    } catch {
      /* ignorar */
    }
  },
}));
