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

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>,
    document.body
  );
}