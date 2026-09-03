"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * The "⋯" on a task or project card: Edit, and a destructive Delete.
 *
 * One markup, two presentations, the way iOS does it — a popover anchored
 * to the button on a pointer device, and a bottom action sheet within
 * thumb reach on a phone. Which one you get is decided at open time from
 * the same 760px breakpoint the nav uses, so the card never has to know.
 *
 * It renders through a portal because the project rail scrolls
 * horizontally (`overflow-x: auto`), which would clip a menu positioned
 * inside the card. Fixed coordinates are read from the button when it
 * opens, and the menu closes on scroll rather than trying to follow — a
 * menu that drifts away from what it belongs to is worse than one that
 * gets out of the way.
 */
export default function CardMenu({
  label,
  onEdit,
  onDelete,
  deleteTitle,
  deleteMessage,
}: {
  /** What this menu acts on, for screen readers — e.g. the task's title. */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle: string;
  deleteMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (open) return setOpen(false);

    const isSheet = window.matchMedia("(max-width: 760px)").matches;
    setSheet(isSheet);
    if (!isSheet && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Flip above the button when a menu below would run off the screen.
      setPos(
        spaceBelow < 140
          ? { bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 8, right: window.innerWidth - rect.right }
      );
    }
    setOpen(true);
  }

  function pick(action: "edit" | "delete") {
    setOpen(false);
    if (action === "edit") onEdit();
    else setConfirming(true);
  }

  const items = (
    <>
      <button type="button" className="card-menu-item" role="menuitem" onClick={() => pick("edit")}>
        <span className="card-menu-icon" aria-hidden>
          ✎
        </span>
        Edit
      </button>
      <button type="button" className="card-menu-item card-menu-item-danger" role="menuitem" onClick={() => pick("delete")}>
        <span className="card-menu-icon" aria-hidden>
          🗑
        </span>
        Delete
      </button>
    </>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`card-menu-trigger${open ? " active" : ""}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for "${label}"`}
        title="More actions"
      >
        ⋯
      </button>

      {open &&
        createPortal(
          sheet ? (
            <>
              <div className="card-menu-backdrop" onClick={() => setOpen(false)} />
              <div className="card-menu-sheet" ref={menuRef} role="menu" aria-label={label}>
                <div className="card-menu-grip" />
                <div className="card-menu-sheet-title">{label}</div>
                {items}
                <button type="button" className="card-menu-item card-menu-item-cancel" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div
              className={`card-menu-popover${pos?.bottom !== undefined ? " card-menu-popover-up" : ""}`}
              ref={menuRef}
              role="menu"
              aria-label={label}
              style={{ top: pos?.top, bottom: pos?.bottom, right: pos?.right }}
            >
              {items}
            </div>
          ),
          document.body
        )}

      {confirming && (
        <ConfirmModal
          title={deleteTitle}
          message={deleteMessage}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
