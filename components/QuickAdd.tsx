"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddStudentModal from "@/components/AddStudentModal";
import AddTransactionModal from "@/components/AddTransactionModal";

/**
 * One "+" that creates anything, from anywhere.
 *
 * Adding a project used to mean: navigate to Projects, find the button,
 * open the modal. The two entities whose create-modals are already
 * self-contained (student, transaction) open right here without leaving
 * the page; the two that live inside their page's own state (project,
 * note) are deep-linked with `?new=1`, which those pages read on mount —
 * still one click, and the URL is shareable/bookmarkable as a side effect.
 */

const ITEMS = [
  { id: "project", icon: "🗂️", label: "Project", hint: "Board card with progress" },
  { id: "note", icon: "📝", label: "Note", hint: "Markdown doc in the library" },
  { id: "student", icon: "🎓", label: "Student", hint: "Enrollment and tuition" },
  { id: "transaction", icon: "💰", label: "Transaction", hint: "Income or expense" },
] as const;

type ItemId = (typeof ITEMS)[number]["id"];

export default function QuickAdd({ variant }: { variant: "pill" | "tab" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"student" | "transaction" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(id: ItemId) {
    setOpen(false);
    if (id === "project") router.push("/projects?new=1");
    else if (id === "note") router.push("/content?new=1");
    else setModal(id);
  }

  return (
    <>
      <div className={variant === "tab" ? "quick-add quick-add-tab" : "quick-add"} ref={ref}>
        <button
          type="button"
          className={variant === "tab" ? "nav-bottom-add" : "quick-add-trigger"}
          onClick={() => setOpen((o) => !o)}
          aria-label="Quick add"
          aria-expanded={open}
          title="Quick add"
        >
          +
        </button>
        {open && (
          <div className={`quick-add-menu${variant === "tab" ? " quick-add-menu-up" : ""}`} role="menu">
            <div className="popover-menu-title">Add new</div>
            {ITEMS.map((item) => (
              <button key={item.id} type="button" className="quick-add-item" role="menuitem" onClick={() => pick(item.id)}>
                <span className="quick-add-item-icon">{item.icon}</span>
                <span>
                  <span className="quick-add-item-label">{item.label}</span>
                  <span className="quick-add-item-hint">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {modal === "student" && <AddStudentModal onClose={() => setModal(null)} onCreated={() => setModal(null)} />}
      {modal === "transaction" && <AddTransactionModal onClose={() => setModal(null)} onCreated={() => setModal(null)} />}
    </>
  );
}
