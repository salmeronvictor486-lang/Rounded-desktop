import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, type LucideIcon } from 'lucide-react';

export type MenuItem =
  | {
      type?: 'item';
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
      onSelect?: () => void;
      submenu?: MenuItem[];
    }
  | { type: 'separator' }
  | { type: 'label'; label: string };

interface MenuListProps {
  items: MenuItem[];
  anchor: { x: number; y: number; alignRight?: boolean; anchorRect?: DOMRect };
  onClose: () => void;
  level?: number;
  label?: string;
}

/** Lista de menú flotante con navegación por teclado (flechas, Inicio/Fin, Enter, Escape). */
export function MenuList({ items, anchor, onClose, level = 0, label }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subAnchor, setSubAnchor] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = anchor.alignRight ? anchor.x - r.width : anchor.x;
    let top = anchor.y;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8);
    if (left < 8) left = 8;
    if (top + r.height > window.innerHeight - 8) {
      top = anchor.anchorRect ? anchor.anchorRect.top - r.height - 4 : window.innerHeight - r.height - 8;
      if (top < 8) top = 8;
    }
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (level === 0) {
      const first = ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])');
      first?.focus();
    }
  }, [level]);

  const focusables = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]:not([aria-disabled="true"])') ?? []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = focusables();
    const idx = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(idx + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(idx - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && level > 0)) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} className="menu-sep" role="separator" />;
        if (item.type === 'label') return <div key={i} className="menu-label">{item.label}</div>;
        const Icon = item.icon;
        const hasSub = !!item.submenu?.length;
        const activate = (el: HTMLElement) => {
          if (item.disabled) return;
          if (hasSub) {
            const r = el.getBoundingClientRect();
            setSubAnchor({ x: r.right - 4, y: r.top });
            setOpenSub(i);
            return;
          }
          onClose();
          item.onSelect?.();
        };
        return (
          <div
            key={i}
            role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={hasSub || undefined}
            aria-expanded={hasSub ? openSub === i : undefined}
            tabIndex={-1}
            className={`menu-item ${item.danger ? 'is-danger' : ''} ${item.disabled ? 'is-disabled' : ''}`}
            onClick={(e) => activate(e.currentTarget)}
            onMouseEnter={(e) => {
              if (hasSub) activate(e.currentTarget);
              else setOpenSub(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && hasSub)) {
                e.preventDefault();
                activate(e.currentTarget);
              }
            }}
          >
            <span className="menu-icon">
              {item.checked ? <Check size={15} /> : Icon ? <Icon size={15} aria-hidden="true" /> : null}
            </span>
            <span className="menu-text">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
            {hasSub && <ChevronRight size={14} className="menu-chevron" />}
            {hasSub && openSub === i && subAnchor && (
              <MenuList
                items={item.submenu!}
                anchor={subAnchor}
                level={level + 1}
                onClose={() => {
                  setOpenSub(null);
                  (ref.current?.children[i] as HTMLElement | undefined)?.focus();
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface OpenMenu {
  items: MenuItem[];
  anchor: MenuListProps['anchor'];
  label?: string;
  returnFocus?: HTMLElement | null;
}

/** Hook para abrir un menú anclado a un botón o en la posición del ratón (menú contextual). */
export function useMenu() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  const close = useCallback(() => {
    setMenu((m) => {
      m?.returnFocus?.focus();
      return null;
    });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = () => close();
    const onBlur = () => close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [menu, close]);

  const openAt = useCallback((items: MenuItem[], x: number, y: number, label?: string) => {
    setMenu({ items, anchor: { x, y }, label, returnFocus: document.activeElement as HTMLElement });
  }, []);

  const openFrom = useCallback((items: MenuItem[], el: HTMLElement, opts: { alignRight?: boolean; label?: string } = {}) => {
    const r = el.getBoundingClientRect();
    setMenu({
      items,
      anchor: { x: opts.alignRight ? r.right : r.left, y: r.bottom + 4, alignRight: opts.alignRight, anchorRect: r },
      label: opts.label,
      returnFocus: el,
    });
  }, []);

  const element: ReactNode = menu
    ? createPortal(<MenuList items={menu.items} anchor={menu.anchor} onClose={close} label={menu.label} />, document.body)
    : null;

  return { openAt, openFrom, close, element, isOpen: !!menu };
}

/** Botón que despliega un menú. */
export function MenuButton({
  items,
  children,
  className = '',
  label,
  alignRight,
  disabled,
}: {
  items: MenuItem[] | (() => MenuItem[]);
  children: ReactNode;
  className?: string;
  label: string;
  alignRight?: boolean;
  disabled?: boolean;
}) {
  const menu = useMenu();
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        aria-label={label}
        title={label}
        disabled={disabled}
        onMouseDown={(e) => {
          if (menu.isOpen) e.stopPropagation();
        }}
        onClick={(e) => {
          if (menu.isOpen) {
            menu.close();
            return;
          }
          menu.openFrom(typeof items === 'function' ? items() : items, e.currentTarget, { alignRight, label });
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            menu.openFrom(typeof items === 'function' ? items() : items, e.currentTarget, { alignRight, label });
          }
        }}
      >
        {children}
      </button>
      {menu.element}
    </>
  );
}
