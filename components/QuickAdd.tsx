"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddStudentModal from "@/components/AddStudentModal";
import AddTransactionModal from "@/components/AddTransactionModal";

/**
 * One "+" that creates anything, from anywhere.
 *
 * The two entities whose create-modals are already self-contained
 * (student, transaction) open right here without leaving the page; task
 * and project live inside the Tasks page's own state, so they are
 * deep-linked with `?new=1` / `?newProject=1`, which that page reads on
 * mount — still one click, and the URL is shareable as a side effect.
 *
 * Tasks are the exception to needing this at all: the Tasks page and the
 * Overview both carry an always-visible capture box, so this menu is the
 * long way round for a task, kept only for the pages that don't.
 */

const ITEMS = [
  { id: "task", icon: "✅", label: "Task", hint: "Anything you need to get done" },
  { id: "project", icon: "🗂️", label: "Project", hint: "A container tasks can belong to" },
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
    if (id === "task") router.push("/tasks?new=1");
    else if (id === "project") router.push("/tasks?newProject=1");
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
