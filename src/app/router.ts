import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'files'; folderId: string | null; kind: string | null; query: string }
  | { name: 'templates'; kind: string | null }
  | { name: 'trash' }
  | { name: 'settings' }
  | { name: 'edit'; id: string }
  | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = h.split('?');
  const params = new URLSearchParams(queryPart);
  const segs = pathPart.split('/').filter(Boolean);
  if (segs.length === 0) return { name: 'home' };
  switch (segs[0]) {
    case 'files':
      return { name: 'files', folderId: params.get('folder'), kind: params.get('kind'), query: params.get('q') ?? '' };
    case 'templates':
      return { name: 'templates', kind: params.get('kind') };
    case 'trash':
      return { name: 'trash' };
    case 'settings':
      return { name: 'settings' };
    case 'edit':
      return segs[1] ? { name: 'edit', id: decodeURIComponent(segs[1]) } : { name: 'notfound' };
    default:
      return { name: 'notfound' };
  }
}

export function navigate(to: string, replace = false): void {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (replace) history.replaceState(null, '', target);
  else if (location.hash !== target) location.hash = target;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const editPath = (id: string) => `/edit/${encodeURIComponent(id)}`;
