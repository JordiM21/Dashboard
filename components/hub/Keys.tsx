"use client";

/**
 * Keyboard layer: arrows (or WASD) move an animated selector ring between
 * anything clickable using spatial navigation, Enter clicks it, digits jump
 * to sidebar modules, and every quick action fires from its (rebindable)
 * combo. The ring hides the moment the mouse moves — two modes, no fight.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useHub } from "@/lib/hub/store";
import { bindings, comboOf, DIRS, KEY_ACTIONS, prettyCombo, WASD } from "@/lib/hub/keys";
import { sfx, sfxFor } from "@/lib/hub/sound";
import { NAV } from "./Sidebar";
import { Sheet } from "./ui";

type Dir = "up" | "down" | "left" | "right";
const TARGETS = 'button:not([disabled]), a[href], [role="checkbox"], [role="option"], summary, select, [data-kbd]';

const typing = (el: Element | null) => !!el && ((el as HTMLElement).isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

function scope(): HTMLElement | null {
  const sheets = document.querySelectorAll<HTMLElement>(".sheet");
  return sheets[sheets.length - 1] ?? document.querySelector<HTMLElement>(".hub");
}

function candidates(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TARGETS)).filter((el) => {
    if (el.closest(".t-actions, [aria-hidden='true'], .xp-fly")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
  });
}

/** Corner radius in px (a "50%" circle becomes half its short side) so it can animate with the ring. */
function radiusPx(el: HTMLElement, r: DOMRect): number {
  const v = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(v) || 8;
  return Math.max(6, v.endsWith("%") ? (Math.min(r.width, r.height) * n) / 100 : Math.min(n, Math.min(r.width, r.height) / 2));
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Nearest candidate in a direction: edge distance along it, plus 2× the sideways offset (zero when they overlap). */
function nearest(from: HTMLElement, list: HTMLElement[], dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ac = center(a);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === from || el.contains(from) || from.contains(el)) continue;
    const r = el.getBoundingClientRect();
    const c = center(r);
    const vertical = dir === "up" || dir === "down";
    const ahead = dir === "down" ? c.y - ac.y : dir === "up" ? ac.y - c.y : dir === "right" ? c.x - ac.x : ac.x - c.x;
    if (ahead <= 2) continue;
    const primary = dir === "down" ? r.top - a.bottom : dir === "up" ? a.top - r.bottom : dir === "right" ? r.left - a.right : a.left - r.right;
    const overlap = vertical ? Math.min(a.right, r.right) - Math.max(a.left, r.left) : Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
    const side = overlap > 0 ? 0 : vertical ? Math.abs(c.x - ac.x) : Math.abs(c.y - ac.y);
    const score = Math.max(0, primary) + side * 2 + (overlap > 0 ? 0 : 40);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function firstIn(list: HTMLElement[]): HTMLElement | null {
  const main = document.getElementById("main");
  const inView = list.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 60 && r.bottom <= innerHeight && (!main || main.contains(el) || el.closest(".sheet"));
  });
  return inView.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left)[0] ?? list[0] ?? null;
}

export default function KeyboardLayer({ run }: { run: (id: string) => void }) {
  const s = useHub();
  const router = useRouter();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; r: number } | null>(null);
  const ref = useRef<HTMLElement | null>(null);
  ref.current = target;
  const keys = bindings(s.settings.keys);
  const wasd = s.settings.navKeys === "wasd";

  // Follow the target through scrolling, resizing and re-renders.
  useEffect(() => {
    if (!target) return setBox(null);
    target.setAttribute("data-kbd-target", "");
    let raf = 0;
    const loop = () => {
      if (!target.isConnected) return setTarget(null);
      const r = target.getBoundingClientRect();
      setBox((b) => (b && Math.abs(b.x - r.left) < 0.5 && Math.abs(b.y - r.top) < 0.5 && Math.abs(b.w - r.width) < 0.5 && Math.abs(b.h - r.height) < 0.5 ? b : { x: r.left, y: r.top, w: r.width, h: r.height, r: radiusPx(target, r) }));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      target.removeAttribute("data-kbd-target");
    };
  }, [target]);

  // Mouse takes over: the ring steps aside.
  useEffect(() => {
    if (!target) return;
    const off = () => setTarget(null);
    window.addEventListener("pointermove", off, { once: true });
    window.addEventListener("pointerdown", off, { once: true });
    return () => {
      window.removeEventListener("pointermove", off);
      window.removeEventListener("pointerdown", off);
    };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const active = document.activeElement;
      if (typing(active)) {
        if (e.key === "Escape" && !document.querySelector(".palette, .sheet")) (active as HTMLElement).blur();
        return;
      }
      if (document.querySelector(".palette, .menu")) return; // they own their keys
      const mod = e.ctrlKey || e.metaKey || e.altKey;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = DIRS[e.key] ?? (wasd && !mod && !e.shiftKey ? WASD[k] : undefined);

      if (dir && !mod) {
        e.preventDefault();
        const root = scope();
        if (!root) return;
        const list = candidates(root);
        const cur = ref.current && ref.current.isConnected && root.contains(ref.current) ? ref.current : null;
        const next = cur ? nearest(cur, list, dir) : firstIn(list);
        if (!next) return;
        setTarget(next);
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        sfx.step();
        return;
      }
      if (e.key === "Enter" && ref.current?.isConnected) {
        e.preventDefault();
        const el = ref.current;
        sfxFor(el);
        if (el.tagName === "SELECT") {
          el.focus();
          (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
        } else el.click();
        return;
      }
      if (e.key === "Escape" && ref.current) return setTarget(null);
      if (document.querySelector(".sheet")) return; // no macros under a sheet

      if (!mod && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const href = e.key === "0" ? "/character" : NAV[Number(e.key) - 1]?.href;
        if (href) {
          sfx.nav();
          router.push(href);
        }
        return;
      }
      const combo = comboOf(e);
      const hit = Object.entries(keys).find(([, c]) => c === combo);
      if (hit) {
        e.preventDefault();
        run(hit[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, wasd, run, router]);

  return (
    <AnimatePresence>
      {box && (
        <motion.div
          className="kbd-ring"
          aria-hidden
          initial={{ opacity: 0, scale: 1.08, x: box.x - 3, y: box.y - 3, width: box.w + 6, height: box.h + 6, borderRadius: box.r + 3 }}
          animate={{ opacity: 1, scale: 1, x: box.x - 3, y: box.y - 3, width: box.w + 6, height: box.h + 6, borderRadius: box.r + 3 }}
          exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7, opacity: { duration: 0.12 } }}
        />
      )}
    </AnimatePresence>
  );
}

export function CheatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useHub();
  const keys = bindings(s.settings.keys);
  const nav: [string, string][] = [
    [s.settings.navKeys === "wasd" ? "W A S D · ← ↑ → ↓" : "← ↑ → ↓", "Move the selector"],
    ["↵", "Click the selected item"],
    ["1 – 9", "Jump to sidebar module"],
    ["0", "Character sheet"],
    ["Esc", "Close / clear selection"],
  ];
  return (
    <Sheet open={open} onClose={onClose} wide label="Keyboard shortcuts">
      <h2 className="title">Keyboard</h2>
      <div className="bento" style={{ gap: 24 }}>
        <div className="span-5 col" style={{ gap: 6 }}>
          <span className="label">Navigate</span>
          {nav.map(([k, l]) => (
            <div key={l} className="row callout" style={{ minHeight: 30 }}>
              <span className="grow">{l}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
        <div className="span-7 col" style={{ gap: 6 }}>
          <span className="label">Quick actions</span>
          {KEY_ACTIONS.map((a) => (
            <div key={a.id} className="row callout" style={{ minHeight: 30 }}>
              <span className="grow">{a.label}</span>
              <span className="kbd">{prettyCombo(keys[a.id])}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="caption muted" style={{ margin: 0 }}>
        Rebind any quick action in Settings → Keys.
      </p>
    </Sheet>
  );
}
