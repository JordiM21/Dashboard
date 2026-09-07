"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A popup button that stands in for a native `<select>`.
 *
 * A `<select>` can be styled shut but not open: the list itself is drawn by
 * the OS, so it arrives with the system blue highlight and system font no
 * matter what the page says. This renders the list ourselves, through the
 * same .popover-menu rows the navbar and the tag filter already use, so
 * every menu in the app opens the same way.
 *
 * On a phone the list becomes a bottom sheet rather than a tiny anchored
 * panel — same reasoning as the card "⋯" menu: options belong within thumb
 * reach, not wherever the trigger happens to sit.
 */
export type SelectOption = { value: string; label: string };

export default function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Select…",
  className = "",
  ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Styling for the trigger — "capture-select" for the pill, "select-field" in a form row. */
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Capture phase + stopImmediatePropagation, because the modal this may
      // be sitting in listens for Escape on document too. Plain
      // stopPropagation does nothing between two listeners on the same node,
      // and the modal's was registered first — so Escape closed the whole
      // task sheet instead of just this menu.
      e.stopImmediatePropagation();
      setOpen(false);
    }
    // Only the anchored popover needs this: it lives inside rootRef, so
    // containment tells us what's "outside". The sheet is portaled to
    // document.body, where every row would read as outside — the press would
    // close the menu and unmount the row before its click ever landed, and
    // tapping an option would do nothing. Its own backdrop handles that.
    if (!sheet) document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, sheet]);

  const rows = options.map((o) => (
    <button
      key={o.value}
      type="button"
      className="popover-menu-row"
      role="option"
      aria-selected={o.value === value}
      onClick={() => {
        onChange(o.value);
        setOpen(false);
      }}
    >
      <span className="popover-menu-check">{o.value === value ? "✓" : ""}</span>
      {o.label}
    </button>
  ));

  return (
    <div className="select-menu" ref={rootRef}>
      <button
        type="button"
        className={`select-menu-trigger ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setSheet(window.matchMedia("(max-width: 760px)").matches);
          setOpen((o) => !o);
        }}
      >
        <span className="select-menu-value">{selected?.label ?? placeholder}</span>
      </button>

      {open &&
        (sheet ? (
          // Through a portal, or the sheet doesn't reach the bottom of the
          // screen: `.page` animates in with a transform, and a transformed
          // ancestor becomes the containing block for `position: fixed`, so
          // "fixed to the viewport" quietly means "fixed to the page card".
          // The same is true inside a modal. document.body has no such
          // ancestor. Clicks still bubble through React's tree, which is
          // what keeps the close-on-outside handler below working.
          createPortal(
            <>
              <div className="card-menu-backdrop select-menu-backdrop" onClick={() => setOpen(false)} />
              <div className="card-menu-sheet select-menu-sheet" role="listbox" aria-label={ariaLabel}>
                <div className="card-menu-grip" />
                {ariaLabel && <div className="card-menu-sheet-title">{ariaLabel}</div>}
                {rows}
              </div>
            </>,
            document.body
          )
        ) : (
          <div className="popover-menu select-menu-list" role="listbox" aria-label={ariaLabel}>
            {rows}
          </div>
        ))}
    </div>
  );
}
