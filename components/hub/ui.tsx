"use client";

/** Work-layer primitives (Design Guide §7). */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import {
  BookOpen, Books, CalendarHeart, Check as CheckIcon, Folder, GameController, Gift, GraduationCap, Heart, House, MapPin, Target, User, Star, Briefcase, Airplane, Barbell, MusicNotes, Camera, Code, Plant, PawPrint,
  Lightning, Rocket, Trophy, Coffee, Brain, Palette, Leaf, Sun, Moon, Car, Bicycle, ShoppingCart, Wallet, PiggyBank, ChartLine, Megaphone, ChatCircle, Envelope, Calendar, Clock, FilmSlate, Television, Headphones, Book, Pencil, Lightbulb, Flag, Sparkle, Globe, Mountains, Tree, Dog, Cat, Cake, Basketball, SoccerBall, Sword, Shield, Crown, Diamond, Key, Wrench, Hammer, PaintBrush, Flask, Atom, Laptop, DeviceMobile, Users, Baby, Bed, ForkKnife, Kanban, Note,
  type Icon as PhIcon,
} from "@phosphor-icons/react";
import type { Area } from "@/lib/hub/types";

export const ICONS: Record<string, PhIcon> = {
  GraduationCap, BookOpen, Heart, User, GameController, House, Target, Gift, Books, MapPin, CalendarHeart, Folder, Star, Briefcase, Airplane, Barbell, MusicNotes, Camera, Code, Plant, PawPrint,
  Lightning, Rocket, Trophy, Coffee, Brain, Palette, Leaf, Sun, Moon, Car, Bicycle, ShoppingCart, Wallet, PiggyBank, ChartLine, Megaphone, ChatCircle, Envelope, Calendar, Clock, FilmSlate, Television, Headphones, Book, Pencil, Lightbulb, Flag, Sparkle, Globe, Mountains, Tree, Dog, Cat, Cake, Basketball, SoccerBall, Sword, Shield, Crown, Diamond, Key, Wrench, Hammer, PaintBrush, Flask, Atom, Laptop, DeviceMobile, Users, Baby, Bed, ForkKnife, Kanban, Note,
};
export const IconByName = ({ name, size = 18, weight = "regular" }: { name: string; size?: number; weight?: "regular" | "fill" | "duotone" | "bold" }) => {
  const I = ICONS[name] ?? Folder;
  return <I size={size} weight={weight} />;
};

export const spring = {
  ui: { type: "spring", stiffness: 500, damping: 40 } as const,
  panel: { type: "spring", stiffness: 300, damping: 30 } as const,
  reward: { type: "spring", stiffness: 400, damping: 15 } as const,
};

/** View cross-fade with an 8px rise (§9.5). */
export function Fade({ children, k, className, style }: { children: ReactNode; k?: string; className?: string; style?: CSSProperties }) {
  return (
    <motion.div key={k} className={className} style={style} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}>
      {children}
    </motion.div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; size?: "sm"; label: string }) {
  const id = useId();
  return (
    <div className={`seg ${size === "sm" ? "seg-sm" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={id} className="seg-pill" transition={spring.ui} />}
          {o.label}
          {o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function AreaDot({ area }: { area?: Area }) {
  return <span className="dot" style={{ "--c": area?.color } as CSSProperties} title={area?.name} />;
}

export function AreaChip({ area }: { area?: Area }) {
  if (!area) return null;
  return (
    <span className="chip chip-area" style={{ "--c": area.color } as CSSProperties}>
      <span className="dot" style={{ "--c": area.color } as CSSProperties} />
      {area.name}
    </span>
  );
}

export function Check({ checked, onChange, priority, square, label }: { checked: boolean; onChange: (e: React.MouseEvent) => void; priority?: number; square?: boolean; label: string }) {
  return (
    <button role="checkbox" aria-checked={checked} aria-label={label} className={`check ${square ? "check-sq" : ""}`} data-p={checked ? undefined : priority} onClick={(e) => { e.stopPropagation(); onChange(e); }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function Progress({ value, kind, thin, label }: { value: number; kind?: "xp" | "epic"; thin?: boolean; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`progress ${kind ?? ""} ${thin ? "thin" : ""}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Animated count-up, only on the first mount of a session (§9.10). */
const counted = new Set<string>();
export function Num({ value, id, digits = 0 }: { value: number; id?: string; digits?: number }) {
  const [shown, setShown] = useState(() => (id && !counted.has(id) ? 0 : value));
  const first = useRef(true);
  useEffect(() => {
    if (!id || counted.has(id) || !first.current || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    first.current = false;
    counted.add(id);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, id]);
  return <>{shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</>;
}

export function Money({ value, id, digits = 0, className = "display-l" }: { value: number; id?: string; digits?: number; className?: string }) {
  return (
    <span className={className}>
      {value < 0 && "−"}
      <span className="unit">$</span>
      <Num value={Math.abs(value)} id={id} digits={digits} />
    </span>
  );
}

export function Kpi({ label, children, delta, hint, foot }: { label: string; children: ReactNode; delta?: { value: string; up: boolean } | null; hint?: string; foot?: ReactNode }) {
  return (
    <div className="kpi" title={hint}>
      <span className="callout muted">{label}</span>
      <div className="kpi-row">
        {children}
        {delta && <span className={`delta ${delta.up ? "up" : "down"}`}>{delta.value}</span>}
      </div>
      {foot}
    </div>
  );
}

export function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty">
      <Pip state="idle" size={56} />
      <span>{text}</span>
      {action && (
        <button className="btn btn-sm" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, src, size }: { name: string; src?: string; size?: "lg" }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`avatar ${size === "lg" ? "avatar-lg" : ""}`}>{src ? <img src={src} alt="" width={56} height={56} loading="lazy" /> : initials}</span>;
}

/* ---------------------------------------------------------------- companion */

/**
 * Pip — the companion (§5, R6). An original placeholder character in four
 * states until the commissioned Rive art lands; same API so it can swap in.
 */
export function Pip({ state, size = 64 }: { state: "idle" | "happy" | "sleepy" | "hyped"; size?: number }) {
  const eyes =
    state === "sleepy" ? (
      <g stroke="#15151A" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M24 36q4 3 8 0" />
        <path d="M40 36q4 3 8 0" />
      </g>
    ) : state === "happy" || state === "hyped" ? (
      <g stroke="#15151A" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M24 37q4-5 8 0" />
        <path d="M40 37q4-5 8 0" />
      </g>
    ) : (
      <g fill="#15151A">
        <ellipse cx="28" cy="35" rx="3.2" ry="4" />
        <ellipse cx="44" cy="35" rx="3.2" ry="4" />
      </g>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" className={`pip-${state}`} aria-hidden>
      <ellipse cx="36" cy="66" rx="18" ry="3" fill="currentColor" opacity="0.08" />
      <path d="M36 8c4 0 6 4 6 7 9 2 18 10 18 24 0 15-11 23-24 23S12 54 12 39c0-14 9-22 18-24 0-3 2-7 6-7z" fill="var(--volt)" />
      <path d="M36 8c4 0 6 4 6 7-4-1-8-1-12 0 0-3 2-7 6-7z" fill="#15151A" opacity="0.12" />
      {eyes}
      <ellipse cx="22" cy="44" rx="4" ry="2.4" fill="#FF7A1A" opacity="0.35" />
      <ellipse cx="50" cy="44" rx="4" ry="2.4" fill="#FF7A1A" opacity="0.35" />
      {state === "hyped" ? <path d="M30 46q6 7 12 0z" fill="#15151A" /> : state === "sleepy" ? <circle cx="36" cy="47" r="2" fill="#15151A" /> : <path d="M31 46q5 4 10 0" stroke="#15151A" strokeWidth="2.6" strokeLinecap="round" fill="none" />}
      {state === "sleepy" && (
        <text x="54" y="18" fontSize="12" fontWeight="700" fill="var(--text-3)" fontFamily="var(--font-body)">
          z
        </text>
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------- menus */

export interface MenuItem {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
  sep?: boolean;
  danger?: boolean;
  hint?: string;
}

const MenuCtx = createContext<(e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => void>(() => {});
export const useMenu = () => useContext(MenuCtx);

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", close);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", close);
    };
  }, [menu]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth - 8) el.style.left = `${innerWidth - r.width - 8}px`;
    if (r.bottom > innerHeight - 8) el.style.top = `${innerHeight - r.height - 8}px`;
  }, [menu]);
  return (
    <MenuCtx.Provider
      value={(e, items) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, items });
      }}
    >
      {children}
      <Layer open={!!menu}>
        <AnimatePresence>
          {menu && (
            <motion.div
              ref={ref}
              className="menu"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.12 }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
                const i = btns.indexOf(document.activeElement as HTMLButtonElement);
                if (e.key === "ArrowDown") btns[(i + 1) % btns.length]?.focus();
                if (e.key === "ArrowUp") btns[(i - 1 + btns.length) % btns.length]?.focus();
              }}
            >
              {menu.items.map((it, i) =>
                it.sep ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={i}
                    role="menuitem"
                    className={`menu-item ${it.danger ? "btn-danger" : ""}`}
                    onClick={() => {
                      setMenu(null);
                      it.onClick?.();
                    }}
                  >
                    {it.icon}
                    <span className="grow">{it.label}</span>
                    {it.hint && <span className="faint caption">{it.hint}</span>}
                  </button>
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Layer>
    </MenuCtx.Provider>
  );
}

/** Opens a menu below a trigger button (filter pills, "…" buttons). */
export function useDropdown() {
  const open = useMenu();
  return (e: React.MouseEvent, items: MenuItem[]) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    e.stopPropagation();
    open({ clientX: r.left, clientY: r.bottom + 6, preventDefault: () => {} }, items);
  };
}

/* ---------------------------------------------------------------- sheet */

/** True on phone widths. Structure (tab bar, sheets) switches on this; styling uses the same 767px media query. */
export function useMobile(): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 767px)");
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}

/**
 * Drag-to-dismiss for bottom sheets: drag starts from the grab handle or a
 * heading (never from inputs or buttons), and a short fling or a 110px pull
 * closes it — the iOS sheet gesture.
 */
export function useSheetDrag(onClose: () => void) {
  const controls = useDragControls();
  return {
    drag: "y" as const,
    dragListener: false,
    dragControls: controls,
    dragConstraints: { top: 0, bottom: 0 },
    dragElastic: { top: 0.04, bottom: 0.9 },
    onDragEnd: (_: unknown, i: { offset: { y: number }; velocity: { y: number } }) => (i.offset.y > 110 || i.velocity.y > 600) && onClose(),
    onPointerDown: (e: React.PointerEvent) => {
      const t = e.target as Element;
      if (t.closest("button, a, input, textarea, select, [role=checkbox], .seg")) return;
      const sheet = e.currentTarget as HTMLElement;
      const body = sheet.querySelector(".insp-body") as HTMLElement | null;
      const atTop = (body ?? sheet).scrollTop <= 0;
      if (t.closest(".sheet-grab, .insp-head, h2") || (atTop && e.clientY - sheet.getBoundingClientRect().top < 72)) controls.start(e);
    },
  };
}

/**
 * Wraps an overlay's AnimatePresence. Closed, its subtree goes `inert` at
 * once: no clicks, no focus. Without this a sheet stays mounted (invisible,
 * full-screen, catching every click) until its exit animation finishes —
 * which never happens while the window is covered or the main thread is busy.
 */
export function Layer({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // The browser only moves focus off inert content on its next frame; don't leave typing in a closing input.
  useLayoutEffect(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!open && a && ref.current?.contains(a)) a.blur();
  }, [open]);
  // React 18 has no `inert` prop; as a plain attribute it is set before an opening input's autoFocus runs.
  return (
    <div ref={ref} className="layer" {...({ inert: open ? undefined : "" } as object)}>
      {children}
    </div>
  );
}

export function Sheet({ open, onClose, children, wide, label }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean; label: string }) {
  const mobile = useMobile();
  const drag = useSheetDrag(onClose);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, onClose]);
  return (
    <Layer open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            {mobile ? (
              <motion.div role="dialog" aria-modal aria-label={label} className="sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%", transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }} transition={spring.panel} {...drag}>
                <div className="sheet-grab" aria-hidden />
                {children}
              </motion.div>
            ) : (
              <motion.div
                role="dialog"
                aria-modal
                aria-label={label}
                className={`sheet ${wide ? "sheet-wide" : ""}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              >
                {children}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </Layer>
  );
}

export { CheckIcon };

/** True on touch-first devices (phones, iPad without a trackpad). */
export function useCoarse(): boolean {
  const [c, setC] = useState(false);
  useEffect(() => setC(matchMedia("(pointer: coarse)").matches), []);
  return c;
}

/**
 * Long-press → callback at the touch point (iOS has no right-click). The
 * click that ends a long-press is swallowed so it doesn't also open the row.
 */
export function useLongPress(onLong: (p: { clientX: number; clientY: number }) => void, ms = 430) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);
  const clear = () => clearTimeout(timer.current);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLong({ clientX: start.current.x, clientY: start.current.y });
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}

/** HTML5 drop target for a dragged id (Tasks board/calendar, Social calendar). */
export function useDrop(onDrop: (id: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => (e.preventDefault(), setOver(true)),
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      },
    },
  };
}
