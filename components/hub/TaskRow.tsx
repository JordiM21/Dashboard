"use client";

/** Task row (§7) with the signature completion moment (§9.1). */
import { useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { DotsSixVertical, Play, CalendarBlank, ArrowRight, Archive, Hourglass, ListChecks, Repeat } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import * as A from "@/lib/hub/actions";
import { taskXp } from "@/lib/hub/game";
import { addDays, relDay, today, weekStart } from "@/lib/hub/util";
import type { Task } from "@/lib/hub/types";
import { AreaDot, Check, useMenu } from "./ui";
import { useShell } from "./Shell";

export const rowMotion = {
  layout: true,
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0, transition: { delay: 0.4, duration: 0.2, ease: [0.4, 0, 1, 1] } },
  transition: { type: "spring", stiffness: 500, damping: 40 },
} as const;

export function useTaskMenu() {
  const s = useHub();
  const menu = useMenu();
  return (e: React.MouseEvent, t: Task) =>
    menu(e, [
      { label: t.status === "done" ? "Reopen" : "Complete", onClick: () => (t.status === "done" ? A.reopenTask(t.id) : A.completeTask(t.id, { x: e.clientX, y: e.clientY })) },
      { sep: true, label: "" },
      { label: "Do today", hint: relDay(today()), onClick: () => A.updateTask(t.id, { scheduled: today(), status: t.status === "inbox" ? "next" : t.status }) },
      { label: "Tomorrow", onClick: () => A.updateTask(t.id, { scheduled: addDays(today(), 1), status: t.status === "inbox" ? "next" : t.status }) },
      { label: "Next week", onClick: () => A.updateTask(t.id, { scheduled: addDays(weekStart(), 7), status: t.status === "inbox" ? "next" : t.status }) },
      { sep: true, label: "" },
      ...([1, 2, 3] as const).map((p) => ({ label: `Priority P${p}`, hint: t.priority === p ? "✓" : `!${p}`, onClick: () => A.updateTask(t.id, { priority: p }) })),
      { sep: true, label: "" },
      ...s.areas.filter((a) => a.id !== t.areaId).map((a) => ({ label: `Move to ${a.name}`, onClick: () => A.updateTask(t.id, { areaId: a.id, status: t.status === "inbox" ? "next" : t.status }) })),
      { sep: true, label: "" },
      { label: "Start timer", onClick: () => A.startTimer({ label: t.title, areaId: t.areaId, taskId: t.id, projectId: t.projectId, track: s.projects.find((p) => p.id === t.projectId)?.track }) },
      { label: "Archive", danger: true, onClick: () => A.archive("tasks", t.id, "Task archived") },
    ]);
}

export default function TaskRow({ t, selected, showProject = true, draggable, compact }: { t: Task; selected?: boolean; showProject?: boolean; draggable?: boolean; compact?: boolean }) {
  const s = useHub();
  const { inspect, rec } = useShell();
  const openMenu = useTaskMenu();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const area = s.areas.find((a) => a.id === t.areaId);
  const project = showProject && t.projectId ? s.projects.find((p) => p.id === t.projectId) : undefined;
  const done = t.status === "done" || pending;
  const overdue = !done && t.due != null && t.due < today();
  const date = t.due ?? t.scheduled;
  const xp = s.settings.game !== "off" && !done ? taskXp(t, new Date(), 0) : 0;

  const toggle = (e: React.MouseEvent) => {
    if (t.status === "done") return A.reopenTask(t.id);
    if (pending) {
      clearTimeout(timer.current);
      return setPending(false);
    }
    setPending(true);
    const from = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      setPending(false);
      A.completeTask(t.id, from);
    }, 220);
  };

  return (
    <div
      className="task-row"
      data-done={done}
      data-selected={selected || rec?.id === t.id}
      onContextMenu={(e) => openMenu(e, t)}
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
      style={compact ? { minHeight: 36 } : undefined}
    >
      {draggable && (
        <span className="grip" aria-hidden>
          <DotsSixVertical size={14} />
        </span>
      )}
      <Check checked={done} priority={t.priority} label={`Complete ${t.title}`} onChange={toggle} />
      <button className="t-title truncate" onClick={() => inspect({ kind: "task", id: t.id })}>
        <motion.span animate={{ opacity: done ? 0.55 : 1 }} transition={{ duration: 0.12 }}>
          {t.title}
        </motion.span>
      </button>
      <span className="t-actions">
        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Do today" aria-label="Do today" onClick={() => A.updateTask(t.id, { scheduled: today(), status: t.status === "inbox" ? "next" : t.status })}>
          <CalendarBlank size={15} />
        </button>
        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Start timer" aria-label="Start timer" onClick={() => A.startTimer({ label: t.title, areaId: t.areaId, taskId: t.id, projectId: t.projectId })}>
          <Play size={15} />
        </button>
        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Archive" aria-label="Archive" onClick={() => A.archive("tasks", t.id, "Task archived")}>
          <Archive size={15} />
        </button>
      </span>
      {t.status === "waiting" && (
        <span className="chip warning" title={t.followUp ? `Follow up ${relDay(t.followUp)}` : undefined}>
          <Hourglass size={12} /> {t.waitingOn || "Waiting"}
        </span>
      )}
      {t.checklist.length > 0 && (
        <span className="caption faint row" style={{ gap: 3 }}>
          <ListChecks size={14} />
          {t.checklist.filter((c) => c.done).length}/{t.checklist.length}
        </span>
      )}
      {t.recurrence && <Repeat size={14} className="faint" aria-label="Repeats" />}
      {project && (
        <span className="caption muted truncate" style={{ maxWidth: 160 }}>
          <ArrowRight size={11} /> {project.title}
        </span>
      )}
      {date && (
        <span className="caption" style={{ color: overdue ? "var(--danger-ink)" : "var(--text-2)" }}>
          {relDay(date)}
        </span>
      )}
      {t.estimate ? <span className="caption faint">{t.estimate}m</span> : null}
      {xp > 0 && <span className="xp-ghost">+{xp}</span>}
      <span style={{ "--c": area?.color } as CSSProperties}>
        <AreaDot area={area} />
      </span>
    </div>
  );
}
