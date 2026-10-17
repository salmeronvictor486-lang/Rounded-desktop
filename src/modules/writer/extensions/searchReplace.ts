import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchState {
  term: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  matches: SearchMatch[];
  index: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearch: (opts: { term: string; caseSensitive?: boolean; wholeWord?: boolean }) => ReturnType;
      nextMatch: () => ReturnType;
      previousMatch: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
  interface Storage {
    searchReplace: SearchState;
  }
}

export const searchKey = new PluginKey<DecorationSet>('searchReplace');

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Busca en el texto de cada bloque (las coincidencias no cruzan párrafos). */
export function findMatches(doc: PMNode, term: string, caseSensitive: boolean, wholeWord: boolean): SearchMatch[] {
  if (!term) return [];
  const flags = caseSensitive ? 'g' : 'gi';
  const src = wholeWord ? `(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])` : escapeRegExp(term);
  const re = new RegExp(src, flags + 'u');
  const out: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Texto del bloque con un mapa índice → posición del documento
    let text = '';
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) {
          map.push(pos + 1 + offset + i);
        }
        text += child.text;
      } else {
        map.push(-1);
        text += '￼';
      }
    });
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const from = map[m.index];
      const to = map[m.index + m[0].length - 1] + 1;
      if (from >= 0 && to > from) out.push({ from, to });
    }
    return false;
  });
  return out;
}

const empty: SearchState = { term: '', caseSensitive: false, wholeWord: false, matches: [], index: -1 };

export const SearchReplace = Extension.create({
  name: 'searchReplace',

  addStorage() {
    return { ...empty };
  },

  addCommands() {
    const recompute = (state: any, opts: Partial<SearchState>) => {
      const st = this.storage as SearchState;
      Object.assign(st, opts);
      st.matches = findMatches(state.doc, st.term, st.caseSensitive, st.wholeWord);
      if (st.index >= st.matches.length) st.index = st.matches.length ? 0 : -1;
      if (st.index < 0 && st.matches.length) {
        const sel = state.selection.from;
        const i = st.matches.findIndex((m) => m.from >= sel);
        st.index = i >= 0 ? i : 0;
      }
    };
    const focusMatch = (tr: any, dispatch: any) => {
      const st = this.storage as SearchState;
      const m = st.matches[st.index];
      if (m && dispatch) {
        tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
      }
      tr.setMeta(searchKey, true);
      dispatch?.(tr);
      return true;
    };
    return {
      setSearch:
        ({ term, caseSensitive = false, wholeWord = false }) =>
        ({ state, tr, dispatch }) => {
          (this.storage as SearchState).index = -1;
          recompute(state, { term, caseSensitive, wholeWord });
          tr.setMeta(searchKey, true);
          dispatch?.(tr);
          return true;
        },
      nextMatch:
        () =>
        ({ tr, dispatch }) => {
          const st = this.storage as SearchState;
          if (!st.matches.length) return false;
          st.index = (st.index + 1) % st.matches.length;
          return focusMatch(tr, dispatch);
        },
      previousMatch:
        () =>
        ({ tr, dispatch }) => {
          const st = this.storage as SearchState;
          if (!st.matches.length) return false;
          st.index = (st.index - 1 + st.matches.length) % st.matches.length;
          return focusMatch(tr, dispatch);
        },
      replaceCurrent:
        (replacement) =>
        ({ tr, dispatch }) => {
          const st = this.storage as SearchState;
          const m = st.matches[st.index];
          if (!m) return false;
          // El plugin recalcula las coincidencias al cambiar el documento.
          if (replacement) tr.insertText(replacement, m.from, m.to);
          else tr.delete(m.from, m.to);
          tr.setMeta(searchKey, true);
          dispatch?.(tr);
          return true;
        },
      replaceAll:
        (replacement) =>
        ({ tr, dispatch }) => {
          const st = this.storage as SearchState;
          if (!st.matches.length) return false;
          // De atrás hacia delante para no invalidar posiciones.
          for (const m of [...st.matches].reverse()) {
            if (replacement) tr.insertText(replacement, m.from, m.to);
            else tr.delete(m.from, m.to);
          }
          tr.setMeta(searchKey, true);
          dispatch?.(tr);
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          Object.assign(this.storage as SearchState, { ...empty, matches: [] });
          tr.setMeta(searchKey, true);
          dispatch?.(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as SearchState;
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old, _oldState, newState) => {
            if (!tr.docChanged && !tr.getMeta(searchKey)) return old;
            if (tr.docChanged && storage.term) {
              storage.matches = findMatches(newState.doc, storage.term, storage.caseSensitive, storage.wholeWord);
              if (storage.index >= storage.matches.length) storage.index = storage.matches.length - 1;
            }
            if (!storage.term) return DecorationSet.empty;
            return DecorationSet.create(
              newState.doc,
              storage.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, { class: i === storage.index ? 'search-match is-current' : 'search-match' }),
              ),
            );
          },
        },
        props: {
          decorations(state) {
            return searchKey.getState(state);
          },
        },
      }),
    ];
  },
});

