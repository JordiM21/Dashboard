"use client";

/** Inbox (§5.2): capture lands here with no required fields; triage is one keystroke per item. */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Tray } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import * as A from "@/lib/hub/actions";
import { XP } from "@/lib/hub/game";
import { addDays, today, weekStart, formatDateDMY } from "@/lib/hub/util";
import { Toolbar, useArea, useShell } from "../Shell";
import TaskRow, { rowMotion } from "../TaskRow";
import { Fade, Pip, useDropdown, AreaDot } from "../ui";

export default function Inbox() {
  const s = useHub();
  const { areas } = useArea();
  const { quickAdd, inspect } = useShell();
  const drop = useDropdown();
  const items = useMemo(() => s.tasks.filter((t) => t.status === "inbox" && !t.archivedAt).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [s.tasks]);
  const [sel, setSel] = useState(0);
  const cur = items[Math.min(sel, items.length - 1)];
  const zeroToday = s.game.inboxZeroDays.includes(today());

  const toNote = (id: string) => {
    const t = s.tasks.find((x) => x.id === id)!;
    const n = A.addNote({ title: t.title, body: t.notes, areaId: t.areaId });
    A.archive("tasks", id, "Converted to note");
    inspect({ kind: "note", id: n.id });
  };
  const toItem = (id: string, collectionId: string) => {
    const t = s.tasks.find((x) => x.id === id)!;
    A.addItem(collectionId, t.title);
    A.archive("tasks", id, `Moved to ${s.collections.find((c) => c.id === collectionId)?.name}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || document.querySelector(".scrim")) return;
      if (!cur) return;
      const k = e.key.toLowerCase();
      const done = () => e.preventDefault();
      if (k === "j" || k === "arrowdown") (done(), setSel((i) => Math.min(items.length - 1, i + 1)));
      else if (k === "k" || k === "arrowup") (done(), setSel((i) => Math.max(0, i - 1)));
      else if (/^[1-9]$/.test(k) && areas[Number(k) - 1]) (done(), A.updateTask(cur.id, { areaId: areas[Number(k) - 1].id, status: "next" }));
      else if (k === "t") (done(), A.updateTask(cur.id, { scheduled: today(), status: "next" }));
      else if (k === "m") (done(), A.updateTask(cur.id, { scheduled: addDays(today(), 1), status: "next" }));
      else if (k === "w") (done(), A.updateTask(cur.id, { scheduled: addDays(weekStart(), 7), status: "next" }));
      else if (k === "x") (done(), A.updateTask(cur.id, { status: "next" }));
      else if (k === "e") (done(), toNote(cur.id));
      else if (k === "backspace" || k === "delete") (done(), A.archive("tasks", cur.id, "Dropped from Inbox"));
      else if (k === "enter") (done(), inspect({ kind: "task", id: cur.id }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keys: [string, string][] = [
    ["J K", "move"],
    [`1–${areas.length}`, "area"],
    ["T", "today"],
    ["M", "tomorrow"],
    ["W", "next week"],
    ["X", "to Next"],
    ["E", "to note"],
    ["⌫", "drop"],
    ["↵", "open"],
  ];

  return (
    <>
      <Toolbar title="Inbox">
        <span className="caption muted">{items.length} to triage</span>
      </Toolbar>
      <Fade className="canvas" style={{ maxWidth: 920 }}>
        <header className="page-head">
          <div>
            <h1 className="display-xl">Inbox</h1>
            <p className="callout muted">Capture fast, organise later. Each item takes one key.</p>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={() => quickAdd("")}>
            Capture <span className="kbd">N</span>
          </button>
        </header>

        {items.length > 0 && (
          <div className="row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            {keys.map(([k, l]) => (
              <span key={k} className="caption muted row" style={{ gap: 6 }}>
                <span className="kbd">{k}</span>
                {l}
              </span>
            ))}
          </div>
        )}

        <section className="card" style={{ padding: 8 }}>
          {items.length === 0 ? (
            <div className="empty" style={{ padding: 48 }}>
              <Pip state="happy" size={80} />
              <span className="title" style={{ color: "var(--text-1)" }}>
                Inbox zero
              </span>
              <span>{zeroToday ? `Logged for ${formatDateDMY(today())} · +${XP.inbox} XP earned. ${s.game.inboxZeroDays.length}/10 days toward Zero Inbox.` : "Nothing waiting. Capture with N from anywhere."}</span>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((t, i) => (
                <motion.div key={t.id} {...rowMotion} onMouseEnter={() => setSel(i)} onContextMenu={() => setSel(i)}>
                  <div className="row" style={{ paddingRight: 8 }}>
                    <div className="grow">
                      <TaskRow t={t} selected={i === sel} />
                    </div>
                    <span className="caption faint" style={{ width: 70, textAlign: "right" }}>
                      {formatDateDMY(t.createdAt).slice(0, 5)}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={(e) =>
                        drop(e, [
                          ...areas.map((a, n) => ({ label: a.name, hint: String(n + 1), icon: <AreaDot area={a} />, onClick: () => A.updateTask(t.id, { areaId: a.id, status: "next" as const }) })),
                          { sep: true, label: "" },
                          { label: "Convert to note", hint: "E", onClick: () => toNote(t.id) },
                          ...s.collections.filter((c) => !c.archivedAt).map((c) => ({ label: `Add to ${c.name}`, onClick: () => toItem(t.id, c.id) })),
                        ])
                      }
                    >
                      Triage
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </section>
        {items.length > 0 && (
          <p className="caption faint row" style={{ marginTop: 12, gap: 6 }}>
            <Tray size={14} /> Empty it today for +{XP.inbox} XP.
          </p>
        )}
      </Fade>
    </>
  );
}
