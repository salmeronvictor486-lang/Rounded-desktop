import type { JSONContent } from '@tiptap/core';
import { createSlide } from './layouts';
import { normalizePresentation } from './model.create';
import { newId, type LayoutId, type Presentation, type Slide, type SlideElement, type Theme } from './model';

/** Estado de una presentación abierta: selección, historial y operaciones. */
export class SlidesStore {
  pres: Presentation;
  current = 0;
  selected: string[] = [];
  /** Elemento cuyo texto se está editando. */
  editing: string | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private pendingSnapshot: string | null = null;
  onChange?: () => void;
  clipboard: SlideElement[] = [];

  constructor(p: Presentation) {
    this.pres = normalizePresentation(p);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  emit(dirty = true) {
    this.version++;
    this.listeners.forEach((l) => l());
    if (dirty) this.onChange?.();
  }

  get slide(): Slide {
    return this.pres.slides[Math.min(this.current, this.pres.slides.length - 1)];
  }

  get selection(): SlideElement[] {
    return this.slide.elements.filter((e) => this.selected.includes(e.id));
  }

  // ---------- Historial (instantáneas) ----------

  /** Guarda el estado actual antes de modificarlo. */
  checkpoint() {
    this.undoStack.push(JSON.stringify(this.pres));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Para operaciones continuas (arrastrar): una sola entrada en el historial. */
  beginGesture() {
    this.pendingSnapshot = JSON.stringify(this.pres);
  }

  endGesture() {
    if (this.pendingSnapshot && this.pendingSnapshot !== JSON.stringify(this.pres)) {
      this.undoStack.push(this.pendingSnapshot);
      this.redoStack = [];
      this.emit();
    }
    this.pendingSnapshot = null;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(JSON.stringify(this.pres));
    this.pres = JSON.parse(s);
    this.fixSelection();
    this.emit();
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(JSON.stringify(this.pres));
    this.pres = JSON.parse(s);
    this.fixSelection();
    this.emit();
  }

  private fixSelection() {
    this.current = Math.min(this.current, this.pres.slides.length - 1);
    const ids = new Set(this.slide.elements.map((e) => e.id));
    this.selected = this.selected.filter((id) => ids.has(id));
    if (this.editing && !ids.has(this.editing)) this.editing = null;
  }

  /** Modifica con historial. */
  mutate(fn: (p: Presentation) => void) {
    this.checkpoint();
    fn(this.pres);
    this.fixSelection();
    this.emit();
  }

  // ---------- Diapositivas ----------

  goTo(i: number) {
    const n = Math.max(0, Math.min(i, this.pres.slides.length - 1));
    if (n === this.current) return;
    this.current = n;
    this.selected = [];
    this.editing = null;
    this.emit(false);
  }

  addSlide(layout: LayoutId, at = this.current + 1) {
    this.mutate((p) => p.slides.splice(at, 0, createSlide(layout, p)));
    this.current = at;
    this.selected = [];
    this.emit(false);
  }

  duplicateSlide(i = this.current) {
    this.mutate((p) => {
      const copy: Slide = structuredClone(p.slides[i]);
      copy.id = newId('sl');
      copy.elements = copy.elements.map((e) => ({ ...e, id: newId() }));
      p.slides.splice(i + 1, 0, copy);
    });
    this.current = i + 1;
    this.emit(false);
  }

  deleteSlide(i = this.current) {
    if (this.pres.slides.length <= 1) return;
    this.mutate((p) => p.slides.splice(i, 1));
    this.current = Math.min(this.current, this.pres.slides.length - 1);
    this.selected = [];
    this.emit(false);
  }

  moveSlide(from: number, to: number) {
    if (to < 0 || to >= this.pres.slides.length || from === to) return;
    this.mutate((p) => {
      const [s] = p.slides.splice(from, 1);
      p.slides.splice(to, 0, s);
    });
    this.current = to;
    this.emit(false);
  }

  // ---------- Elementos ----------

  select(ids: string[], additive = false) {
    this.selected = additive ? Array.from(new Set([...this.selected, ...ids])) : ids;
    if (this.editing && !this.selected.includes(this.editing)) this.editing = null;
    this.emit(false);
  }

  toggleSelect(id: string) {
    this.selected = this.selected.includes(id) ? this.selected.filter((x) => x !== id) : [...this.selected, id];
    this.emit(false);
  }

  addElement(el: SlideElement) {
    this.mutate(() => this.slide.elements.push(el));
    this.selected = [el.id];
    this.emit(false);
  }

  updateElements(ids: string[], patch: Partial<SlideElement> | ((e: SlideElement) => void), opts: { history?: boolean } = {}) {
    const apply = () => {
      for (const el of this.slide.elements) {
        if (!ids.includes(el.id)) continue;
        if (typeof patch === 'function') patch(el);
        else Object.assign(el, patch);
      }
    };
    if (opts.history === false) {
      apply();
      this.emit();
    } else this.mutate(apply);
  }

  deleteSelected() {
    if (!this.selected.length) return;
    const ids = new Set(this.selected);
    this.mutate(() => {
      this.slide.elements = this.slide.elements.filter((e) => !ids.has(e.id));
    });
    this.selected = [];
    this.editing = null;
    this.emit(false);
  }

  copySelected() {
    this.clipboard = structuredClone(this.selection);
  }

  paste(offset = 20) {
    if (!this.clipboard.length) return;
    const copies = this.clipboard.map((e) => ({ ...structuredClone(e), id: newId(), x: e.x + offset, y: e.y + offset }));
    this.mutate(() => this.slide.elements.push(...copies));
    this.clipboard = copies;
    this.selected = copies.map((c) => c.id);
    this.emit(false);
  }

  duplicateSelected() {
    this.copySelected();
    this.paste();
  }

  /** Orden de capas. */
  reorder(mode: 'front' | 'back' | 'forward' | 'backward') {
    const ids = new Set(this.selected);
    if (!ids.size) return;
    this.mutate(() => {
      const els = this.slide.elements;
      if (mode === 'front') this.slide.elements = [...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))];
      else if (mode === 'back') this.slide.elements = [...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))];
      else if (mode === 'forward') {
        for (let i = els.length - 2; i >= 0; i--) if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
      } else {
        for (let i = 1; i < els.length; i++) if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
    });
  }

  /** Alinear respecto a la diapositiva (un elemento) o a la selección (varios). */
  align(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const sel = this.selection;
    if (!sel.length) return;
    const W = this.pres.size.width;
    const H = this.pres.size.height;
    const bounds = sel.length === 1 ? { x1: 0, y1: 0, x2: W, y2: H } : {
      x1: Math.min(...sel.map((e) => e.x)), y1: Math.min(...sel.map((e) => e.y)),
      x2: Math.max(...sel.map((e) => e.x + e.w)), y2: Math.max(...sel.map((e) => e.y + e.h)),
    };
    this.updateElements(this.selected, (e) => {
      if (mode === 'left') e.x = bounds.x1;
      if (mode === 'right') e.x = bounds.x2 - e.w;
      if (mode === 'hcenter') e.x = (bounds.x1 + bounds.x2) / 2 - e.w / 2;
      if (mode === 'top') e.y = bounds.y1;
      if (mode === 'bottom') e.y = bounds.y2 - e.h;
      if (mode === 'vcenter') e.y = (bounds.y1 + bounds.y2) / 2 - e.h / 2;
    });
  }

  distribute(axis: 'h' | 'v') {
    const sel = [...this.selection].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
    if (sel.length < 3) return;
    const first = sel[0];
    const last = sel[sel.length - 1];
    const total = sel.reduce((s, e) => s + (axis === 'h' ? e.w : e.h), 0);
    const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
    const gap = (span - total) / (sel.length - 1);
    this.mutate(() => {
      let pos = axis === 'h' ? first.x : first.y;
      for (const s of sel) {
        const el = this.slide.elements.find((e) => e.id === s.id)!;
        if (axis === 'h') el.x = pos;
        else el.y = pos;
        pos += (axis === 'h' ? el.w : el.h) + gap;
      }
    });
  }

  setTheme(theme: Theme, opts: { recolor?: boolean } = {}) {
    const old = this.pres.theme;
    this.mutate((p) => {
      p.theme = structuredClone(theme);
      if (opts.recolor) {
        // Sustituir colores del tema anterior por los del nuevo
        const map = new Map<string, string>([
          [old.colors.title.toLowerCase(), theme.colors.title],
          [old.colors.text.toLowerCase(), theme.colors.text],
          ...old.colors.accent.map((a, i) => [a.toLowerCase(), theme.colors.accent[i] ?? a] as [string, string]),
        ]);
        const fontMap = new Map([[old.fonts.heading, theme.fonts.heading], [old.fonts.body, theme.fonts.body]]);
        const recolor = (c: JSONContent | undefined) => {
          if (!c) return;
          for (const m of c.marks ?? []) {
            if (m.type === 'textStyle' && m.attrs) {
              const col = m.attrs.color as string | undefined;
              if (col && map.has(col.toLowerCase())) m.attrs.color = map.get(col.toLowerCase());
              const f = m.attrs.fontFamily as string | undefined;
              if (f && fontMap.has(f)) m.attrs.fontFamily = fontMap.get(f);
            }
          }
          c.content?.forEach(recolor);
        };
        for (const s of p.slides) {
          for (const e of s.elements) {
            if (e.type === 'text') {
              recolor(e.content);
              const f = e.style.font;
              if (f?.color && map.has(f.color.toLowerCase())) f.color = map.get(f.color.toLowerCase());
              if (f?.family && fontMap.has(f.family)) f.family = fontMap.get(f.family);
            }
            if (e.type === 'shape') {
              recolor(e.content);
              if (e.fill && map.has(e.fill.toLowerCase())) e.fill = map.get(e.fill.toLowerCase())!;
            }
            if (e.type === 'table' && map.has(e.headerFill.toLowerCase())) e.headerFill = map.get(e.headerFill.toLowerCase())!;
          }
        }
      }
    });
  }

  serialize(): Presentation {
    return this.pres;
  }
}
