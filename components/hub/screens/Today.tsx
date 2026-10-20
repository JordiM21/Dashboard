"use client";

/** Today (Feature Spec §5.1, Design Guide §10): answers "what do I do now". */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, UsersThree, Warning, CurrencyDollar, Tray, Kanban, Hourglass, CalendarHeart, CalendarCheck, Lightning, Sparkle, Skull } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { isFocus, taskXp, XP } from "@/lib/hub/game";
import { classesOn, dueSoon, goalProgress, members, receivables, weekDamage, type ClassOccurrence } from "@/lib/hub/metrics";
import { addDays, daysBetween, greeting, money, relDay, today, toMinutes, hhmm, formatDateDMY } from "@/lib/hub/util";
import { Toolbar, useArea, useShell } from "../Shell";
import TaskRow, { rowMotion } from "../TaskRow";
import { BossHp, PhaseBanner } from "../game";
import { Fade, Money, Progress, AreaChip } from "../ui";

export default function Today() {
  const s = useHub();
  const live = useLive();
  const { match, area } = useArea();
  const t0 = today();
  const mrrGoal = s.goals.find((g) => g.metric === "mrr" && g.pinned && !g.archivedAt) ?? s.goals.find((g) => g.metric === "mrr" && !g.archivedAt);
  const boss = mrrGoal ? goalProgress(mrrGoal, s, live) : null;
  const game = s.settings.game !== "off";

  const focusOpen = useMemo(
    () => s.tasks.filter((t) => isFocus(t, t0) && match(t.areaId)).sort((a, b) => a.priority - b.priority || (a.due ?? "9") .localeCompare(b.due ?? "9")),
    [s.tasks, t0, match]
  );

  return (
    <>
      <Toolbar title="Today">
        <span className="caption muted">{formatDateDMY(t0)}</span>
      </Toolbar>
      <Fade className="canvas">
        <header className="page-head">
          <div>
            <h1 className="display-xl">
              {greeting()}, {s.settings.ownerName}
            </h1>
            {boss && (
              <p className="callout muted">
                {boss.defeated ? (
                  "MRR boss defeated. Time to pick the next one."
                ) : game ? (
                  <>
                    <b style={{ color: "var(--text-1)" }}>${money(boss.gap)}</b> left to defeat the MRR boss · {Math.round(boss.pct * 100)}% of the way
                  </>
                ) : (
                  <>${money(boss.gap)} to the ${money(boss.target)} MRR goal</>
                )}
              </p>
            )}
          </div>
        </header>

        <div className="bento">
          <div className="span-8">
            <NextUp focus={focusOpen} tint={area === "all" ? undefined : s.areas.find((a) => a.id === area)?.color} />
          </div>
          <div className="span-4">{mrrGoal && boss && <BossCard title={mrrGoal.title} p={boss} damage={weekDamage(live, s)} />}</div>
          <Quests focus={focusOpen} />
          <Alerts />
          <div className="span-12">
            <Schedule />
          </div>
        </div>
      </Fade>
    </>
  );
}

/* ---------------------------------------------------------------- hero */

function NextUp({ focus, tint }: { focus: ReturnType<typeof useHub>["tasks"]; tint?: string }) {
  const s = useHub();
  const live = useLive();
  const { planDay, inspect } = useShell();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(i);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cls = classesOn(today(), live, s).find((c) => c.endMin > nowMin && c.startMin - nowMin <= 120);
  const top = focus[0];
  const style = { "--hero": tint ?? "var(--accent)" } as CSSProperties;

  if (cls) {
    const live_ = cls.startMin <= nowMin;
    const seats = members(cls.group, live.students).length;
    return (
      <section className="hero" style={style} aria-label="Next up">
        <span className="hero-deco" />
        <span className="label" style={{ color: "rgba(255,255,255,.8)" }}>
          {live_ ? "Class in progress" : `Next class · in ${cls.startMin - nowMin} min`}
        </span>
        <h2 className="display-l">{cls.group.name}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          {cls.slot.start}–{hhmm(new Date(0, 0, 0, 0, cls.endMin))} · {seats} student{seats === 1 ? "" : "s"}
        </p>
        <span className="spacer" />
        <div className="row">
          <Link className="btn btn-hero" href={`/academy?tab=groups&group=${cls.group.id}`}>
            <UsersThree size={16} weight="bold" /> Open group
          </Link>
        </div>
      </section>
    );
  }

  if (top) {
    const area = s.areas.find((a) => a.id === top.areaId);
    const project = s.projects.find((p) => p.id === top.projectId);
    return (
      <section className="hero" style={style} aria-label="Next up">
        <span className="hero-deco" />
        <span className="label" style={{ color: "rgba(255,255,255,.8)" }}>
          Next up · P{top.priority}
          {top.due && top.due < today() ? " · overdue" : ""}
        </span>
        <button className="display-l" style={{ textAlign: "left", color: "#fff", maxWidth: 620 }} onClick={() => inspect({ kind: "task", id: top.id })}>
          {top.title}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          {area?.name}
          {project ? ` · ${project.title}` : ""}
          {top.estimate ? ` · ${top.estimate} min` : ""}
          {top.checklist.length ? ` · ${top.checklist.filter((c) => c.done).length}/${top.checklist.length} steps` : ""}
        </p>
        <span className="spacer" />
        <div className="row">
          <button className="btn btn-hero" onClick={(e) => A.completeTask(top.id, { x: e.clientX, y: e.clientY })}>
            <CheckCircle size={16} weight="bold" /> Complete
          </button>
          <button className="btn btn-hero-ghost" onClick={() => inspect({ kind: "task", id: top.id })}>
            Open
          </button>
          {s.settings.game !== "off" && <span className="xp-chip" style={{ marginLeft: "auto" }}>+{taskXp(top, new Date(), 0)} XP</span>}
        </div>
      </section>
    );
  }

  return (
    <section className="hero" style={style} aria-label="Next up">
      <span className="hero-deco" />
      <span className="label" style={{ color: "rgba(255,255,255,.8)" }}>
        Next up
      </span>
      <h2 className="display-l">{s.game.dayPlans[today()] ? "Focus list clear." : "Nothing planned yet."}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 15 }}>
        {s.game.dayPlans[today()] ? "Pull something from Next, or call it a day." : "Pick up to 7 tasks. Best done the night before — it’s worth +30 XP."}
      </p>
      <span className="spacer" />
      <div className="row">
        <button className="btn btn-hero" onClick={planDay}>
          <CalendarCheck size={16} weight="bold" /> Plan my day
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- boss */

export function BossCard({ title, p, damage, large }: { title: string; p: ReturnType<typeof goalProgress>; damage: number; large?: boolean }) {
  const game = useHub().settings.game !== "off";
  return (
    <section className="card boss col" style={{ height: "100%", gap: 12, padding: large ? 28 : 20 }} aria-label="MRR boss">
      <div className="row">
        {game && <Skull size={18} weight="duotone" style={{ color: "var(--epic)" }} />}
        <span className="label">{game ? "Boss" : "Pinned goal"}</span>
        <span className="spacer" />
        {game && <PhaseBanner pct={p.pct} />}
      </div>
      <h3 className={large ? "title" : "headline"}>{title}</h3>
      <div className="kpi-row">
        <Money value={p.value} id="mrr" className={large ? "display-xl" : "display-l"} />
        <span className="callout muted">/ ${money(p.target)} MRR</span>
      </div>
      {game ? <BossHp pct={p.pct} label={`${Math.round((1 - p.pct) * 100)}% HP left`} /> : <Progress value={p.pct} label="MRR progress" />}
      <div className="row callout">
        <span className="muted">{game ? "HP left" : "Gap"}</span>
        <b>${money(p.gap)}</b>
        <span className="spacer" />
        {damage > 0 && game && (
          <span className="chip" style={{ color: "var(--epic)", borderColor: "color-mix(in srgb, var(--epic) 40%, transparent)" }}>
            −${damage} this week
          </span>
        )}
      </div>
      {p.pace && <span className="caption muted">{p.pace}</span>}
    </section>
  );
}

/* ---------------------------------------------------------------- quests */

function Quests({ focus }: { focus: ReturnType<typeof useHub>["tasks"] }) {
  const s = useHub();
  const { match } = useArea();
  const { planDay } = useShell();
  const [all, setAll] = useState(false);
  const t0 = today();
  const doneToday = s.tasks.filter((t) => t.completedAt?.slice(0, 10) === t0 && ((t.scheduled ?? "9") <= t0 || (t.due ?? "9") <= t0) && match(t.areaId));
  const shown = all ? focus : focus.slice(0, 7);
  const total = focus.length + doneToday.length;
  const xpLeft = focus.reduce((a, t) => a + taskXp(t, new Date(), 0), 0);
  const review = s.reviews.at(-1);
  const weekly = (review?.priorities ?? []).map((id) => s.tasks.find((t) => t.id === id)).filter(Boolean) as typeof s.tasks;
  const game = s.settings.game !== "off";
  const planned = !!s.game.dayPlans[t0];
  const evening = new Date().getHours() >= 17;
  const tmrPlanned = !!s.game.dayPlans[addDays(t0, 1)];
  const alertsVisible = useAlerts().length > 0;

  return (
    <section className={`card ${alertsVisible ? "span-8" : "span-12"}`} aria-label="Daily quests">
      <div className="card-head">
        {game && <Sparkle size={18} weight="duotone" style={{ color: "var(--text-2)" }} />}
        <h3 className="headline">{game ? "Daily quests" : "Focus"}</h3>
        <span className="chip">
          {doneToday.length}/{total}
        </span>
        {game && xpLeft > 0 && <span className="caption faint">{xpLeft} XP on the table</span>}
        <span className="spacer" />
        {tmrPlanned && <span className="chip success">Tomorrow planned</span>}
        <button className="btn btn-sm" onClick={planDay}>
          <CalendarCheck size={14} /> {evening ? (tmrPlanned ? "Edit tomorrow" : "Plan tomorrow") : planned ? "Re-plan" : "Plan my day"}
          {game && ((evening && !tmrPlanned) || (!evening && !planned && new Date().getHours() < 11)) && <span className="xp-ghost">+{XP.plan}</span>}
        </button>
      </div>
      <Progress value={total ? doneToday.length / total : 0} thin kind={doneToday.length && game ? "xp" : undefined} label="Quests done" />
      <div style={{ marginTop: 8 }}>
        <AnimatePresence initial={false}>
          {shown.map((t) => (
            <motion.div key={t.id} {...rowMotion}>
              <TaskRow t={t} />
            </motion.div>
          ))}
        </AnimatePresence>
        {focus.length > 7 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(!all)} style={{ marginLeft: 6 }}>
            {all ? "Show less" : `+${focus.length - 7} more`}
          </button>
        )}
        {focus.length === 0 && <p className="callout muted" style={{ padding: "8px 10px", margin: 0 }}>{doneToday.length ? "Every quest done. That counts." : "No focus tasks yet — plan the day."}</p>}
        {doneToday.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary className="caption muted" style={{ cursor: "pointer", padding: "4px 10px" }}>
              {doneToday.length} done today
            </summary>
            {doneToday.map((t) => (
              <TaskRow key={t.id} t={t} compact />
            ))}
          </details>
        )}
      </div>
      {weekly.length > 0 && (
        <>
          <hr className="divider" style={{ margin: "14px 0 10px" }} />
          <div className="row" style={{ marginBottom: 4 }}>
            <Lightning size={16} weight="duotone" style={{ color: "var(--text-2)" }} />
            <span className="label">{game ? "Weekly quests" : "This week’s priorities"}</span>
            <span className="caption faint">
              {weekly.filter((t) => t.status === "done").length}/{weekly.length}
            </span>
            {game && <span className="xp-ghost">+{XP.priority} each</span>}
          </div>
          {weekly.map((t) => (
            <TaskRow key={t.id} t={t} compact />
          ))}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- alerts */

interface Alert {
  id: string;
  icon: ReactNode;
  text: ReactNode;
  tone: "danger" | "warning" | "default";
  action?: { label: string; run: () => void };
}

function useAlerts(): Alert[] {
  const s = useHub();
  const live = useLive();
  const { inspect } = useShell();
  const { match } = useArea();
  const router = useRouter();
  return useMemo(() => {
    const out: Alert[] = [];
    const t0 = today();
    if (match("let")) {
      for (const r of receivables(live, s))
        out.push({
          id: "rec" + r.student.id,
          icon: <CurrencyDollar size={16} />,
          tone: r.status === "late" ? "danger" : "warning",
          text: (
            <>
              <b>{r.student.name}</b> · ${r.amount} {r.days} day{r.days === 1 ? "" : "s"} overdue
            </>
          ),
          action: { label: "Open", run: () => inspect({ kind: "student", id: r.student.id }) },
        });
      for (const st of dueSoon(live, s))
        out.push({ id: "due" + st.id, icon: <CurrencyDollar size={16} />, tone: "default", text: <><b>{st.name}</b> · payment due {relDay(st.nextPayment!).toLowerCase()}</>, action: { label: "Open", run: () => inspect({ kind: "student", id: st.id }) } });
    }
    const inbox = s.tasks.filter((t) => t.status === "inbox" && !t.archivedAt).length;
    if (inbox > 10) out.push({ id: "inbox", icon: <Tray size={16} />, tone: "default", text: <><b>Inbox at {inbox}</b> · triage before it buries you</>, action: { label: "Triage", run: () => router.push("/inbox") } });
    for (const p of s.projects.filter((p) => p.status === "active" && !p.archivedAt && match(p.areaId)))
      if (!s.tasks.some((t) => t.projectId === p.id && !t.archivedAt && !["done", "dropped"].includes(t.status)))
        out.push({ id: "proj" + p.id, icon: <Kanban size={16} />, tone: "warning", text: <><b>{p.title}</b> · active with no next task</>, action: { label: "Open", run: () => router.push(`/tasks/p/${p.id}`) } });
    for (const t of s.tasks.filter((t) => t.status === "waiting" && t.followUp && t.followUp <= t0 && !t.archivedAt && match(t.areaId)))
      out.push({ id: "wait" + t.id, icon: <Hourglass size={16} />, tone: "default", text: <>Follow up · <b>{t.waitingOn || t.title}</b></>, action: { label: "Open", run: () => inspect({ kind: "task", id: t.id }) } });
    const dates = s.collections.find((c) => c.name === "Important dates");
    for (const i of s.items.filter((i) => i.collectionId === dates?.id && !i.archivedAt)) {
      const d = i.values.date as string | undefined;
      if (!d || !match(dates?.areaId)) continue;
      const thisYear = `${t0.slice(0, 4)}${d.slice(4)}`;
      const next = thisYear >= t0 ? thisYear : `${Number(t0.slice(0, 4)) + 1}${d.slice(4)}`;
      const left = daysBetween(t0, next);
      if (left <= Number(i.values.remind ?? 7)) out.push({ id: "date" + i.id, icon: <CalendarHeart size={16} />, tone: "default", text: <><b>{i.title}</b> · {left === 0 ? "today" : `in ${left} days`}</>, action: { label: "Open", run: () => inspect({ kind: "item", id: i.id }) } });
    }
    return out;
  }, [s, live, match, inspect, router]);
}

function Alerts() {
  const alerts = useAlerts();
  if (alerts.length === 0) return null; // hidden when empty, never "no alerts"
  return (
    <section className="card span-4" aria-label="Alerts">
      <div className="card-head">
        <Warning size={18} style={{ color: "var(--text-2)" }} />
        <h3 className="headline">Needs action</h3>
        <span className="chip">{alerts.length}</span>
      </div>
      <div className="col" style={{ gap: 2, maxHeight: 420, overflow: "auto", margin: "0 -8px" }}>
        {alerts.map((a) => (
          <div key={a.id} className="task-row" style={{ minHeight: 40 }}>
            <span style={{ color: a.tone === "danger" ? "var(--danger-ink)" : a.tone === "warning" ? "var(--warning-ink)" : "var(--text-2)", display: "inline-flex" }}>{a.icon}</span>
            <span className="callout grow" style={{ minWidth: 0 }}>
              {a.text}
            </span>
            {a.action && (
              <button className="btn btn-sm btn-ghost" onClick={a.action.run}>
                {a.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- schedule */

function Schedule() {
  const s = useHub();
  const live = useLive();
  const router = useRouter();
  const t0 = today();
  const classes = classesOn(t0, live, s);
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const i = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => clearInterval(i);
  }, []);
  const startH = Math.min(8, ...classes.map((c) => Math.floor(c.startMin / 60)));
  const endH = Math.max(21, ...classes.map((c) => Math.ceil(c.endMin / 60)));
  const span = (endH - startH) * 60;
  const pos = (m: number) => `${((m - startH * 60) / span) * 100}%`;
  const let_ = s.areas.find((a) => a.id === "let")?.color;

  return (
    <section className="card" aria-label="Schedule">
      <div className="card-head">
        <h3 className="headline">Schedule</h3>
        <span className="callout muted">
          {classes.length} class{classes.length === 1 ? "" : "es"} · {Math.round(classes.reduce((a, c) => a + c.slot.minutes, 0) / 6) / 10}h teaching
        </span>
        <span className="spacer" />
        <span className="caption faint">Google Calendar events arrive in Phase 2</span>
      </div>
      <div className="timeline">
        {Array.from({ length: endH - startH }, (_, i) => (
          <span key={i} className="tl-hour" style={{ left: pos((startH + i) * 60) }}>
            {startH + i}
          </span>
        ))}
        {classes.map((c: ClassOccurrence) => (
          <button key={c.group.id + c.startMin} className="tl-event" style={{ left: pos(c.startMin), width: `calc(${(c.slot.minutes / span) * 100}% - 2px)`, "--c": let_, height: 38 } as CSSProperties} onClick={() => router.push(`/academy?tab=groups&group=${c.group.id}`)} title="Open group">
            <b>{c.group.name}</b> <span className="muted">{c.slot.start}</span>
          </button>
        ))}
        {nowMin >= startH * 60 && nowMin <= endH * 60 && <span className="tl-now" style={{ left: pos(nowMin) }} aria-label="Now" />}
      </div>
    </section>
  );
}

