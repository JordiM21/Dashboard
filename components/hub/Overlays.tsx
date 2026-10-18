"use client";

/** Command palette (⌘K), quick-add (N) and toasts. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { MagnifyingGlass, Plus, ArrowRight, CheckCircle, Note, User, Kanban, Target, SquaresFour, UsersThree, Moon, NotePencil, CalendarCheck, ClipboardText, Lightning, GearSix } from "@phosphor-icons/react";
import { getState, useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import { parseQuickAdd } from "@/lib/hub/parse";
import * as A from "@/lib/hub/actions";
import { dismiss, toast, useToasts } from "@/lib/hub/fx";
import { formatDateDMY, relDay } from "@/lib/hub/util";
import { NAV } from "./Sidebar";
import { useShell, useArea } from "./Shell";

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const s = useHub();
  const live = useLive();
  const router = useRouter();
  const { inspect, quickAdd, lessonLog, planDay, settings } = useShell();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => router.push(href);
    const actions: Cmd[] = [
      { id: "new-task", group: "Create", label: q ? `Create task “${q}”` : "New task", icon: <Plus size={18} />, hint: "N", run: () => (q ? createFromText(q, live.students) : quickAdd("")) },
      { id: "new-note", group: "Create", label: "New note", icon: <NotePencil size={18} />, run: () => inspect({ kind: "note", id: A.addNote({ title: q || "Untitled" }).id }) },
      { id: "log", group: "Create", label: "Log a lesson", icon: <ClipboardText size={18} />, run: () => lessonLog() },
      { id: "plan", group: "Actions", label: "Plan my day", icon: <CalendarCheck size={18} />, run: planDay },
      { id: "review", group: "Actions", label: "Start weekly review", icon: <Lightning size={18} />, run: go("/goals/review") },
      { id: "settings", group: "Actions", label: "Settings · areas, keys, sound", icon: <GearSix size={18} />, hint: ",", run: settings },
      { id: "theme", group: "Actions", label: "Toggle dark mode", icon: <Moon size={18} />, run: () => A.setSettings({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }) },
      ...s.templates.map((t) => ({ id: "tpl" + t.id, group: "Actions", label: `Use template: ${t.name}`, icon: <Kanban size={18} />, run: () => toast(`${A.applyTemplate(t.id)} tasks created from “${t.name}”`) })),
      ...NAV.map((n, i) => ({ id: "nav" + n.href, group: "Go to", label: n.label, hint: String(i + 1), icon: <ArrowRight size={18} />, run: go(n.href) })),
      { id: "nav-char", group: "Go to", label: "Character sheet", icon: <ArrowRight size={18} />, run: go("/character") },
    ];
    if (!q) return actions;
    const n = norm(q);
    const hit = (t: string) => norm(t).includes(n);
    const ents: Cmd[] = [
      ...s.tasks.filter((t) => !t.archivedAt && hit(t.title)).slice(0, 6).map((t) => ({ id: t.id, group: "Tasks", label: t.title, hint: t.status === "done" ? "Done" : relDay(t.due ?? t.scheduled), icon: <CheckCircle size={18} />, run: () => inspect({ kind: "task", id: t.id }) })),
      ...s.projects.filter((p) => !p.archivedAt && hit(p.title)).slice(0, 4).map((p) => ({ id: p.id, group: "Projects", label: p.title, icon: <Kanban size={18} />, run: go(`/tasks/p/${p.id}`) })),
      ...live.students.filter((x) => hit(x.name) || hit(x.parentEmail ?? "")).slice(0, 5).map((x) => ({ id: x.id, group: "Students", label: x.name, hint: x.classGroup, icon: <User size={18} />, run: () => inspect({ kind: "student", id: x.id }) })),
      ...live.groups.filter((g) => hit(g.name)).map((g) => ({ id: g.id, group: "Groups", label: g.name, hint: `Level ${g.currentLevel}`, icon: <UsersThree size={18} />, run: go(`/academy?group=${g.id}`) })),
      ...s.notes.filter((x) => !x.archivedAt && (hit(x.title) || hit(x.body))).slice(0, 5).map((x) => ({ id: x.id, group: "Notes", label: x.title, icon: <Note size={18} />, run: () => inspect({ kind: "note", id: x.id }) })),
      ...s.goals.filter((g) => !g.archivedAt && hit(g.title)).slice(0, 4).map((g) => ({ id: g.id, group: "Goals", label: g.title, icon: <Target size={18} />, run: () => inspect({ kind: "goal", id: g.id }) })),
      ...s.items.filter((i) => !i.archivedAt && hit(i.title)).slice(0, 5).map((i) => ({ id: i.id, group: "Items", label: i.title, hint: s.collections.find((c) => c.id === i.collectionId)?.name, icon: <SquaresFour size={18} />, run: () => inspect({ kind: "item", id: i.id }) })),
      ...live.files.filter((f) => hit(f.title) || f.tags.some(hit)).slice(0, 4).map((f) => ({ id: f.id, group: "Resources", label: f.title, icon: <SquaresFour size={18} />, run: () => window.open(`/api/resources/files/${f.id}/content`, "_blank") })),
    ];
    return [...ents, ...actions.filter((a) => a.id === "new-task" || hit(a.label))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, s, live]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (c: Cmd) => {
    onClose();
    c.run();
  };

  // Window-level so the keys work even if focus slips off the input.
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") (e.preventDefault(), setSel((i) => Math.min(cmds.length - 1, i + 1)));
      else if (e.key === "ArrowUp") (e.preventDefault(), setSel((i) => Math.max(0, i - 1)));
      else if (e.key === "Enter" && cmds[sel]) (e.preventDefault(), run(cmds[sel]));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="palette" role="dialog" aria-label="Command palette" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }} transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}>
            <div className="palette-input">
              <MagnifyingGlass size={20} className="faint" />
              <input
                autoFocus
                className="input-bare"
                placeholder="Search, jump, create…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                role="combobox"
                aria-expanded
                aria-controls="pal-list"
              />
              <span className="kbd">Esc</span>
            </div>
            <div className="palette-list" id="pal-list" role="listbox" ref={listRef}>
              {cmds.map((c, i) => {
                const head = c.group !== lastGroup;
                lastGroup = c.group;
                return (
                  <div key={c.group + c.id}>
                    {head && <div className="pal-group label">{c.group}</div>}
                    <button className="pal-item" role="option" aria-selected={i === sel} data-i={i} onMouseMove={() => setSel(i)} onClick={() => run(c)}>
                      {c.icon}
                      <span className="grow truncate">{c.label}</span>
                      {c.hint && <span className="faint caption">{c.hint}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="pal-foot">
              <span>Space to open</span>
              <span>↑↓ to move</span>
              <span>↵ to open</span>
              <span>#area +project !1 @student tomorrow</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Shared by palette and quick-add: parse one line and create a task or a Collection item. */
function createFromText(text: string, students: { id: string; name: string }[], areaDefault?: string) {
  const st = getState();
  const p = parseQuickAdd(text, {
    areas: st.areas,
    projects: st.projects.filter((x) => !x.archivedAt).map((x) => ({ id: x.id, name: x.title })),
    students,
    collections: st.collections.filter((c) => !c.archivedAt),
  });
  if (!p.title) return;
  if (p.collectionId) {
    A.addItem(p.collectionId, p.title);
    toast(`Added “${p.title}” to ${st.collections.find((c) => c.id === p.collectionId)?.name}`);
    return;
  }
  const project = p.projectId ? st.projects.find((x) => x.id === p.projectId) : undefined;
  const areaId = p.areaId ?? project?.areaId ?? areaDefault;
  const t = A.addTask({
    title: p.title,
    ...(areaId ? { areaId } : {}),
    projectId: p.projectId,
    priority: p.priority ?? 2,
    due: p.due,
    studentId: p.studentId,
    status: p.due || p.projectId || p.areaId ? "next" : "inbox",
  });
  toast(t.status === "inbox" ? `Captured to Inbox` : `Added “${t.title}”${t.due ? ` · ${relDay(t.due)}` : ""}`);
}

export function QuickAdd({ value, onClose }: { value: string | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const s = useHub();
  const live = useLive();
  const { area } = useArea();
  useEffect(() => {
    if (value !== null) setText(value);
  }, [value]);

  const p = useMemo(
    () =>
      parseQuickAdd(text, {
        areas: s.areas,
        projects: s.projects.filter((x) => !x.archivedAt).map((x) => ({ id: x.id, name: x.title })),
        students: live.students.map((x) => ({ id: x.id, name: x.name })),
        collections: s.collections.filter((c) => !c.archivedAt),
      }),
    [text, s.areas, s.projects, s.collections, live.students]
  );

  return (
    <AnimatePresence>
      {value !== null && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="palette" role="dialog" aria-label="Quick add" initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }} transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                createFromText(text, live.students, area === "all" ? undefined : area);
                setText("");
                onClose();
              }}
            >
              <div className="palette-input">
                <Plus size={20} className="faint" />
                <input autoFocus className="input-bare" placeholder="Capture anything… e.g. Call Mateo's mum tomorrow #let !1" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} aria-label="Quick add" />
                <span className="kbd">↵</span>
              </div>
            </form>
            <div className="row" style={{ padding: "12px 18px", flexWrap: "wrap", minHeight: 48 }}>
              {p.chips.length === 0 ? (
                <span className="callout faint">Lands in the Inbox. Add a date, #area, +project, !1–!3, @student, or start with /games to add to a Collection.</span>
              ) : (
                <>
                  {p.chips.map((c) => (
                    <span key={c.kind + c.label} className="chip accent">
                      {c.kind === "date" ? `${relDay(c.label)} · ${formatDateDMY(c.label)}` : c.label}
                    </span>
                  ))}
                  <span className="callout muted truncate">{p.title}</span>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} className="toast" layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }} transition={{ type: "spring", stiffness: 500, damping: 40 }}>
            <span className="truncate">{t.text}</span>
            {t.undo && (
              <button
                onClick={() => {
                  t.undo!();
                  dismiss(t.id);
                }}
              >
                Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
