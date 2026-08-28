"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { ALL_NAV_TABS, DEFAULT_VISIBLE_TAB_IDS, NAV_STORAGE_KEY } from "@/lib/navConfig";

type Theme = "light" | "dark";

// Warms a tab's JS chunk as soon as the user shows intent to visit it
// (hover/focus/touch — before the actual click), instead of waiting for
// navigation to start the download. Teaching is by far the heaviest route
// (Excalidraw drags in mermaid/cytoscape/d3/rough.js), so this is what
// turns its multi-second first-compile into a wait that mostly happens
// while the mouse is still moving toward the tab, not after the click.
// Next dedupes the underlying import() itself, so calling this more than
// once (re-hovering, focus then click) costs nothing extra.
const TAB_PRELOADERS: Partial<Record<string, () => void>> = {
  teaching: () => {
    void import("@/components/TeachingView");
  },
};

function preloadTab(id: string) {
  TAB_PRELOADERS[id]?.();
}

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
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      if (next.length === 0) return prev; // always keep at least one tab visible
      localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const visibleTabs = ALL_NAV_TABS.filter((t) => visibleIds.includes(t.id));

  return (
    <nav id="floating-nav">
      {/* Desktop / wide-screen pill */}
      <div className="nav-pill nav-pill-desktop">
        {visibleTabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`nav-tab${pathname?.startsWith(tab.href) ? " active" : ""}`}
            onMouseEnter={() => preloadTab(tab.id)}
            onFocus={() => preloadTab(tab.id)}
            onTouchStart={() => preloadTab(tab.id)}
          >
            {tab.label}
          </Link>
        ))}
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
            <CustomizePanel visibleIds={visibleIds} onToggle={toggleTabVisible} />
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
        <button
          type="button"
          className="theme-toggle"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          ⎋
        </button>
      </div>

      {/* Compact pill for narrow screens */}
      <div className="nav-pill nav-pill-mobile">
        <Link href="/overview" className="nav-mobile-brand">
          {ALL_NAV_TABS.find((t) => pathname?.startsWith(t.href))?.icon ?? "🏠"}{" "}
          {ALL_NAV_TABS.find((t) => pathname?.startsWith(t.href))?.label ?? "Dashboard"}
        </Link>
        <button
          type="button"
          className="theme-switch"
          data-on={theme === "dark"}
          onClick={toggleTheme}
          role="switch"
          aria-checked={theme === "dark"}
          aria-label="Toggle dark mode"
        >
          <span className="theme-switch-knob">{theme === "dark" ? "☾" : "☀︎"}</span>
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      </div>

      {mobileOpen && (
        <div className="nav-mobile-sheet">
          {visibleTabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`nav-mobile-item${pathname?.startsWith(tab.href) ? " active" : ""}`}
              onClick={() => setMobileOpen(false)}
              onTouchStart={() => preloadTab(tab.id)}
            >
              <span>{tab.icon}</span> {tab.label}
            </Link>
          ))}
          <div className="nav-mobile-divider" />
          <div className="nav-mobile-item nav-mobile-label">Show on navbar</div>
          {ALL_NAV_TABS.map((tab) => (
            <label key={tab.id} className="nav-mobile-checkbox">
              <input
                type="checkbox"
                checked={visibleIds.includes(tab.id)}
                onChange={() => toggleTabVisible(tab.id)}
              />
              <span>{tab.icon}</span> {tab.label}
            </label>
          ))}
          <div className="nav-mobile-divider" />
          <button type="button" className="nav-mobile-item" onClick={handleSignOut} style={{ width: "100%", textAlign: "left" }}>
            <span>⎋</span> Sign out
          </button>
        </div>
      )}
    </nav>
  );
}

function CustomizePanel({
  visibleIds,
  onToggle,
}: {
  visibleIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="popover-menu">
      <div className="popover-menu-title">Show on navbar</div>
      {ALL_NAV_TABS.map((tab) => (
        <label key={tab.id} className="popover-menu-row">
          <input
            type="checkbox"
            checked={visibleIds.includes(tab.id)}
            onChange={() => onToggle(tab.id)}
          />
          <span>{tab.icon}</span> {tab.label}
        </label>
      ))}
    </div>
  );
}
