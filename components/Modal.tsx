"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  title,
  onClose,
  children,
  maxWidth,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Overrides the default 560px cap — the resource visualizer needs more room for markdown/text editing and PDF/preview panes. */
  maxWidth?: number;
}) {
  const [mounted, setMounted] = useState(false);

  // Ensures document.body is accessible only after mounting on the client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape closes, and the page behind stops scrolling while a modal is up —
  // both are what any native dialog does, and their absence is what made
  // these feel like web forms rather than sheets.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    // Closing on the *press*, not just the release: selecting text in a
    // field and letting go past the edge of the sheet used to count as a
    // click on the backdrop and dismissed it mid-edit.
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()} style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>,
    document.body
  );
}