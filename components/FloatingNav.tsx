"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import QuickAdd from "@/components/QuickAdd";
import { ALL_NAV_TABS, DEFAULT_VISIBLE_TAB_IDS, NAV_STORAGE_KEY, type NavTab } from "@/lib/navConfig";

type Theme = "light" | "dark";

// How many tabs get their own slot in the mobile bottom bar. Three plus the
// add button and More fills a phone's width without shrinking labels past
// legibility; everything else is one tap away behind More.
const MOBILE_BAR_TABS = 3;

export default function FloatingNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[]>(DEFAULT_VISIBLE_TAB_IDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const initial = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);

    try {
      const storedTabs = JSON.parse(localStorage.getItem(NAV_STORAGE_KEY) ?? "null");
      if (Array.isArray(storedTabs) && storedTabs.length > 0) {
        setVisibleIds(storedTabs.filter((id) => ALL_NAV_TABS.some((t) => t.id === id)));
      }
    } catch {
      // ignore malformed stored value, fall back to default
    }
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // A route change means the sheet did its job — leaving it open over the
  // page you just navigated to is the classic "why is this still here".
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  function handleSignOut() {
    signOut(auth);
  }

  function toggleTabVisible(id: string) {
    setVisibleIds((prev) => {
      // Turning a tab back on appends it rather than restoring some original
      // slot — the order is yours now, and it lands where you can drag it.
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      if (next.length === 0) return prev; // always keep at least one tab visible
      localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function reorderTabs(next: string[]) {
    setVisibleIds(next);
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
  }

  // The stored list *is* the order — so a tab dragged to second place is
  // second everywhere: the desktop pill, and the phone's bottom bar.
  const visibleTabs = visibleIds
    .map((id) => ALL_NAV_TABS.find((t) => t.id === id))
    .filter((t): t is (typeof ALL_NAV_TABS)[number] => Boolean(t));
  const isActive = (href: string) => pathname?.startsWith(href) ?? false;
  const barTabs = visibleTabs.slice(0, MOBILE_BAR_TABS);
  const sheetTabs = visibleTabs.slice(MOBILE_BAR_TABS);

  return (
    <>
      <nav id="floating-nav">
        <div className="nav-pill nav-pill-desktop">
          {visibleTabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`nav-tab${isActive(tab.href) ? " active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}
          <QuickAdd variant="pill" />
          <div className="nav-customize" ref={customizeRef}>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setCustomizeOpen((o) => !o)}
              aria-label="Customize navigation"
              title="Customize navigation"
            >
              ⚙
            </button>
            {customizeOpen && (
              <div className="popover-menu popover-menu-wide">
                <NavTabsEditor visibleIds={visibleIds} onToggle={toggleTabVisible} onReorder={reorderTabs} />
              </div>
            )}
          </div>
          <button
            type="button"
            className="theme-switch"
            data-on={theme === "dark"}
            onClick={toggleTheme}
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            <span className="theme-switch-knob">{theme === "dark" ? "☾" : "☀︎"}</span>
          </button>
        </div>

        {/* Separate pill so it visually follows the main pill as tabs are added/removed */}
        <div className="nav-pill nav-pill-desktop nav-signout-pill">
          <button type="button" className="theme-toggle" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
            ⎋
          </button>
        </div>
      </nav>

      {/* Phones get a real bottom tab bar instead of a hamburger: the three
          most-used destinations and "add anything" are one thumb-reach tap,
          which is the whole difference between checking a number and
          giving up on checking it. */}
      <nav className="nav-bottom" aria-label="Main">
        {barTabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`nav-bottom-item${isActive(tab.href) ? " active" : ""}`}
          >
            <span className="nav-bottom-icon">{tab.icon}</span>
            <span className="nav-bottom-label">{tab.label}</span>
          </Link>
        ))}
        <QuickAdd variant="tab" />
        <button
          type="button"
          className={`nav-bottom-item${mobileOpen ? " active" : ""}`}
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
        >
          <span className="nav-bottom-icon">☰</span>
          <span className="nav-bottom-label">More</span>
        </button>
      </nav>

      {mobileOpen && (
        <>
          <div className="nav-sheet-backdrop" onClick={() => setMobileOpen(false)} />
          <div className="nav-sheet" role="dialog" aria-label="More">
            <div className="nav-sheet-grip" />
            {sheetTabs.length > 0 && (
              <div className="nav-sheet-grid">
                {sheetTabs.map((tab) => (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className={`nav-sheet-tile${isActive(tab.href) ? " active" : ""}`}
                  >
                    <span className="nav-sheet-tile-icon">{tab.icon}</span>
                    {tab.label}
                  </Link>
                ))}
              </div>
            )}

            <div className="nav-sheet-row">
              <button type="button" className="btn btn-secondary" onClick={toggleTheme} style={{ flex: 1, justifyContent: "center" }}>
                {theme === "dark" ? "☀︎ Light mode" : "☾ Dark mode"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleSignOut} style={{ flex: 1, justifyContent: "center" }}>
                ⎋ Sign out
              </button>
            </div>

            <div className="nav-mobile-label">The first {MOBILE_BAR_TABS} become the bottom tabs</div>
            <NavTabsEditor visibleIds={visibleIds} onToggle={toggleTabVisible} onReorder={reorderTabs} />
          </div>
        </>
      )}
    </>
  );
}

/**
 * Which tabs show, and in what order. Visible tabs come first, in your
 * order, each with a grip you can drag; hidden ones sit below until you
 * switch them on.
 *
 * The drag runs on Pointer Events rather than HTML5 drag-and-drop, which
 * simply does not fire on a touchscreen — and this is installed as a PWA,
 * so a phone is the main way it gets used. `touch-action: none` on the grip
 * is what stops the sheet scrolling away under your finger; everywhere else
 * in the list scrolls normally.
 *
 * Rows swap as soon as the pointer crosses into another row, so what you
 * see mid-drag is already the result — there is no separate drop step to
 * get wrong.
 */
function NavTabsEditor({
  visibleIds,
  onToggle,
  onReorder,
}: {
  visibleIds: string[];
  onToggle: (id: string) => void;
  onReorder: (next: string[]) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = visibleIds
    .map((id) => ALL_NAV_TABS.find((t) => t.id === id))
    .filter((t): t is NavTab => Boolean(t));
  const hidden = ALL_NAV_TABS.filter((t) => !visibleIds.includes(t.id));

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragId) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-visible-row]") ?? []);
    const from = visibleIds.indexOf(dragId);
    const to = rows.findIndex((row) => {
      const r = row.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (to === -1 || to === from) return;
    const next = [...visibleIds];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onReorder(next);
  }

  return (
    <div className="nav-tabs-editor" ref={listRef}>
      <div className="nav-tabs-editor-title">On the navbar — drag to reorder</div>
      {visible.map((tab) => (
        <div
          key={tab.id}
          data-visible-row
          className={`nav-tab-row${dragId === tab.id ? " dragging" : ""}`}
        >
          <button
            type="button"
            className="nav-tab-grip"
            aria-label={`Reorder ${tab.label}`}
            onPointerDown={(e) => startDrag(e, tab.id)}
            onPointerMove={onDragMove}
            onPointerUp={() => setDragId(null)}
            onPointerCancel={() => setDragId(null)}
          >
            ⠿
          </button>
          <span className="nav-tab-row-icon" aria-hidden>
            {tab.icon}
          </span>
          <span className="nav-tab-row-label">{tab.label}</span>
          <button
            type="button"
            className="nav-tab-remove"
            aria-label={`Hide ${tab.label} from the navbar`}
            onClick={() => onToggle(tab.id)}
          >
            −
          </button>
        </div>
      ))}

      {hidden.length > 0 && (
        <>
          <div className="nav-tabs-editor-title">Hidden</div>
          {hidden.map((tab) => (
            <button key={tab.id} type="button" className="nav-tab-row nav-tab-row-hidden" onClick={() => onToggle(tab.id)}>
              <span className="nav-tab-row-icon" aria-hidden>
                {tab.icon}
              </span>
              <span className="nav-tab-row-label">{tab.label}</span>
              <span className="nav-tab-add" aria-hidden>
                +
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
