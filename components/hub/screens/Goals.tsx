"use client";

/** Goals (§5.4, §10): the pinned boss is the focal point; other goals as smaller bosses by horizon; Someday plans as folders. */
import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Lightning, Plus, CalendarCheck, Folder, Skull } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { XP } from "@/lib/hub/game";
import { goalProgress, ledger, monthNet, mrrHistory, newPaying, payingStudents, weekDamage } from "@/lib/hub/metrics";
import { money, monthKey, monthName, prevMonth, weekStart } from "@/lib/hub/util";
import type { Goal, Horizon } from "@/lib/hub/types";
import { Toolbar, useArea, useShell } from "../Shell";
import { BossCard } from "./Today";
import { BossHp } from "../game";
import { Fade, Progress, Sheet, AreaDot, IconByName } from "../ui";
import { coverCss } from "../Customize";

export function PillBars({ data, fmt, kind, hiLast = true }: { data: { label: string; value: number }[]; fmt: (n: number) => string; kind?: "xp"; hiLast?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="pillbars">
      {data.map((d, i) => (
        <div key={d.label + i} className={`pillbar ${kind ?? ""}`} data-hi={hiLast && i === data.length - 1}>
          <span className="bubble">{fmt(d.value)}</span>
          <i style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }} />
          <span className="lbl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Goals() {
  const s = useHub();
  const live = useLive();
  const { match } = useArea();
  const { inspect } = useShell();
  const [monthly, setMonthly] = useState(false);
  const game = s.settings.game !== "off";
  const goals = s.goals.filter((g) => !g.archivedAt && match(g.areaId));
  const boss = goals.find((g) => g.pinned && g.metric === "mrr") ?? goals.find((g) => g.pinned);
  const bossP = boss ? goalProgress(boss, s, live) : null;
  const hist = useMemo(() => mrrHistory(live, s), [live, s]);
  const reviewedThisWeek = s.reviews.some((r) => r.week === weekStart() || r.doneAt >= weekStart());
  const create = (horizon: Horizon) => inspect({ kind: "goal", id: A.addGoal({ title: horizon === "someday" ? "New plan" : "New goal", areaId: s.ui.area === "all" ? "let" : s.ui.area, horizon }).id });

  return (
    <>
      <Toolbar title="Goals">
        <Link href="/character" className="btn btn-sm btn-ghost">
          Character sheet
        </Link>
      </Toolbar>
      <Fade className="canvas">
        <header className="page-head">
          <div>
            <h1 className="display-xl">Goals</h1>
            <p className="callout muted" style={{ maxWidth: 720 }}>
              A <b>goal</b> is a result you can measure, with a target and a deadline (“$1,500 MRR by June”). The work to get there lives in <b>projects</b> and tasks. Progress comes from Stripe, tasks and collections.
            </p>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={() => setMonthly(true)}>
            <CalendarCheck size={16} /> Monthly review
          </button>
          <Link href="/goals/review" className="btn btn-primary">
            <Lightning size={16} weight="fill" /> {reviewedThisWeek ? "Review again" : "Weekly review"}
            {game && !reviewedThisWeek && <span className="xp-chip" style={{ height: 20 }}>+{XP.review}</span>}
          </Link>
        </header>

        {boss && bossP && (
          <div className="bento" style={{ marginBottom: 32 }}>
            <div className="span-8">
              <BossCard title={boss.title} p={bossP} damage={boss.metric === "mrr" ? weekDamage(live, s) : 0} large />
            </div>
            <section className="card span-4">
              <div className="card-head">
                <span className="headline">MRR, last 6 months</span>
              </div>
              <PillBars data={hist.map((h) => ({ label: monthName(h.month), value: h.value }))} fmt={(n) => `$${money(n)}`} />
              <p className="caption muted" style={{ margin: "10px 0 0" }}>
                {payingStudents(live, s).length} paying students · {newPaying(live, s, monthKey()).length} new this month
              </p>
            </section>
          </div>
        )}

        {(["week", "quarter", "year"] as const).map((h) => {
          const list = goals.filter((g) => g.horizon === h && g.id !== boss?.id);
          return (
            <section key={h} style={{ marginBottom: 28 }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="label">{h === "week" ? "This week" : h === "quarter" ? "This quarter" : "This year"}</span>
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={() => create(h)}>
                  <Plus size={14} /> Goal
                </button>
              </div>
              {list.length === 0 ? (
                <p className="callout faint" style={{ margin: 0 }}>No {h} goals.</p>
              ) : (
                <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", paddingTop: 0 }}>
                  {list.map((g) => (
                    <MiniBoss key={g.id} g={g} onOpen={() => inspect({ kind: "goal", id: g.id })} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <section>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="label">Someday · plans</span>
            <span className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={() => create("someday")}>
              <Plus size={14} /> Plan
            </button>
          </div>
          <div className="grid-cards">
            {goals
              .filter((g) => g.horizon === "someday")
              .map((g) => {
                const a = s.areas.find((x) => x.id === g.areaId);
                return (
                  <button key={g.id} className="folder" style={{ "--c": a?.color } as CSSProperties} onClick={() => inspect({ kind: "goal", id: g.id })}>
                    {g.cover && <div className="card-cover" style={{ background: coverCss(g.cover) }} />}
                    <div className="row">
                      <span className="folder-icon">
                        <IconByName name={g.icon ?? "Folder"} weight="duotone" />
                      </span>
                      <span className="caption muted">{a?.name}</span>
                    </div>
                    <span className="headline">{g.title}</span>
                    <span className="callout muted">
                      {g.timeframe || "No timeframe"}
                      {g.budget ? ` · $${money(g.budget)}` : ""}
                    </span>
                    <span className="row" style={{ marginTop: "auto" }}>
                      <span className="chip">{(g.planStatus ?? "idea")[0].toUpperCase() + (g.planStatus ?? "idea").slice(1)}</span>
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      </Fade>
      <MonthlySheet open={monthly} onClose={() => setMonthly(false)} />
    </>
  );
}

function MiniBoss({ g, onOpen }: { g: Goal; onOpen: () => void }) {
  const s = useHub();
  const live = useLive();
  const p = goalProgress(g, s, live);
  const a = s.areas.find((x) => x.id === g.areaId);
  const game = s.settings.game !== "off";
  const fmt = (n: number) => (g.unit === "$" ? `$${money(n)}` : `${money(n)}`);
  return (
    <button className="card hoverable edge col" style={{ "--edge": a?.color, textAlign: "left", gap: 10 } as CSSProperties} onClick={onOpen}>
      <div className="row">
        {g.icon ? <span style={{ color: a?.color, display: "inline-flex" }}><IconByName name={g.icon} size={16} weight="duotone" /></span> : <AreaDot area={a} />}
        <span className="caption muted">{a?.name}</span>
        <span className="spacer" />
        {p.defeated ? <span className="chip success">Defeated</span> : game && <Skull size={16} weight="duotone" style={{ color: "var(--epic)" }} />}
      </div>
      <span className="headline">{g.title}</span>
      {g.description && <span className="caption muted" style={{ marginTop: -6 }}>{g.description}</span>}
      <div className="kpi-row">
        <span className="display-m">{fmt(p.value)}</span>
        <span className="callout muted">
          / {fmt(p.target)} {g.unit !== "$" ? g.unit : ""}
        </span>
      </div>
      {game ? <BossHp pct={p.pct} /> : <Progress value={p.pct} />}
      <span className="caption muted">{p.pace ?? (p.defeated ? "Done." : "No deadline")}</span>
    </button>
  );
}

function MonthlySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useHub();
  const live = useLive();
  const month = new Date().getDate() <= 7 ? prevMonth(monthKey()) : monthKey();
  const existing = s.monthly.find((m) => m.month === month);
  const [text, setText] = useState(existing?.reflection ?? "");
  const net = monthNet(ledger(live, s), month);
  const inS = newPaying(live, s, month);
  const out = live.students.filter((x) => s.studentMeta[x.id]?.churnedAt?.startsWith(month));
  const tasksByArea = s.areas.map((a) => ({ a, n: s.tasks.filter((t) => t.areaId === a.id && t.completedAt?.startsWith(month)).length }));
  return (
    <Sheet open={open} onClose={onClose} wide label="Monthly review">
      <h2 className="title">
        Monthly review · {monthName(month)} {month.slice(0, 4)}
      </h2>
      <div className="bento" style={{ gap: 12 }}>
        <div className="tile span-3 kpi">
          <span className="callout muted">Revenue</span>
          <span className="display-m">${money(net.income)}</span>
        </div>
        <div className="tile span-3 kpi">
          <span className="callout muted">Net (business)</span>
          <span className="display-m">${money(net.net)}</span>
        </div>
        <div className="tile span-3 kpi">
          <span className="callout muted">Students in</span>
          <span className="display-m">+{inS.length}</span>
        </div>
        <div className="tile span-3 kpi">
          <span className="callout muted">Students out</span>
          <span className="display-m">−{out.length}</span>
        </div>
        <div className="tile span-12">
          <div className="label" style={{ marginBottom: 8 }}>Tasks done by area</div>
          {tasksByArea.map(({ a, n }) => (
            <div key={a.id} className="row callout" style={{ minHeight: 24 }}>
              <AreaDot area={a} /> <span className="grow">{a.name}</span> <b>{n}</b>
            </div>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Reflection</span>
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="What worked, what didn’t, what changes next month?" />
      </label>
      <div className="row">
        <span className="caption muted">{existing ? "Saved — edit and save again." : "Three months in a row unlocks Bookkeeper."}</span>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => (A.saveMonthly(month, text), onClose())}>
          Save review
        </button>
      </div>
    </Sheet>
  );
}

