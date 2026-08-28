"use client";

import { useEffect, useRef, useState } from "react";
import type { WeeklyPlanTagDoc } from "@/lib/types";

/**
 * Apple-style popup button for the Weekly Plans sidebar's tag filter —
 * replaces a plain native `<select>`, which renders with the OS's own
 * dropdown chrome (default blue highlight, system font) that clashes with
 * every other control in this app. Same floating-panel/row styling as the
 * navbar's "Customize navigation" menu (see .popover-menu* in globals.css),
 * so the app has one consistent "popup menu" affordance instead of two.
 */
export default function TagFilterDropdown({
  tags,
  value,
  onChange,
}: {
  tags: WeeklyPlanTagDoc[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = tags.find((t) => t.id === value);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          fontSize: 12.5,
          padding: "6px 10px",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-sm)",
          background: "var(--cream)",
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        {selected && <span style={{ width: 7, height: 7, borderRadius: "50%", background: selected.color, flexShrink: 0 }} />}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.name : "Filter by tag: All"}
        </span>
        <span style={{ color: "var(--ink-soft)", fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
          ▾
        </span>
      </button>

      {open && (
        <div className="popover-menu" role="listbox" style={{ left: 0, right: 0, minWidth: 0 }}>
          <button type="button" className="popover-menu-row" role="option" aria-selected={value === "all"} onClick={() => select("all")}>
            <span className="popover-menu-check">{value === "all" ? "✓" : ""}</span>
            All tags
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="popover-menu-row"
              role="option"
              aria-selected={value === tag.id}
              onClick={() => select(tag.id)}
            >
              <span className="popover-menu-check">{value === tag.id ? "✓" : ""}</span>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: tag.color, flexShrink: 0 }} />
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
