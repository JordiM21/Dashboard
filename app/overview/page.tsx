"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import KpiCard from "@/components/KpiCard";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_BADGE_CLASS } from "@/lib/studentStatus";
import { formatDateDMY, formatDayMonth } from "@/lib/dateUtils";
import TaskCapture from "@/components/tasks/TaskCapture";
import TaskCard from "@/components/tasks/TaskCard";
import TaskEditModal from "@/components/tasks/TaskEditModal";
import ProgressRing from "@/components/tasks/ProgressRing";
import { useTaskStore } from "@/lib/useTaskStore";
import { allTags, compareTasks, isOnDeck, isOnRadar, weekDates, weekdayShort, weekProgress } from "@/lib/tasks";
import type { FinanceEntry, Student, Task } from "@/lib/types";
import type { StripeDailyRevenue } from "@/lib/api/stripe";
import type { MetaAdsSummary } from "@/lib/api/meta";

const CHART_PALETTE = ["#ff7a3d", "#22aecb", "#ffc93d", "#ff4d8d", "#4080d0", "#e0475a"];
const RANGE_OPTIONS = [7, 30, 90] as const;
const CHART_H = 200;
const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid var(--line)", background: "var(--white)", color: "var(--ink)" };
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
type RangeOption = (typeof RANGE_OPTIONS)[number];

interface KpiData {
  revenue: StripeDailyRevenue[];
  ads: MetaAdsSummary[];
  sources: { revenue: "live" | "demo"; ads: "live" | "demo" };
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function isInLastNDays(dateIso: string, days: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return dateIso >= localDateIso(cutoff);
}

/** Expense-only totals per category for the selected range — feeds the donut chart. */
function expensesByCategory(entries: FinanceEntry[], days: number) {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.amount >= 0 || !isInLastNDays(e.date, days)) continue;
    map.set(e.category, (map.get(e.category) ?? 0) + Math.abs(e.amount));
  }
  return Array.from(map.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
}

/** Local calendar date (not UTC) as "YYYY-MM-DD" — matches how <input type="date"> values are entered/stored, so "today" here means the business's actual local today, not whatever UTC happens to be at this instant. */
function localDateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Pure UTC-epoch day math from here on — deliberately never mixes local-time Date construction with .toISOString() again, which is what silently dropped the most recent day or two depending on the browser's timezone. */
function isoToEpochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function epochDayToIso(epochDay: number): string {
  return new Date(epochDay * 86400000).toISOString().slice(0, 10);
}

/**
 * Income vs expense bucketed by period — daily buckets under 14 days,
 * weekly under 60, monthly beyond that. A cumulative "running total" line
 * over 90 days makes a ~$600 ledger look like a nearly-flat drift with
 * nothing to read; bucketing shows the actual shape of each period instead
 * (was this week/month net positive or negative, and by how much).
 */
function cashFlowBuckets(entries: FinanceEntry[], days: number) {
  const bucketDays = days <= 14 ? 1 : days <= 60 ? 7 : 30;
  const todayEpoch = isoToEpochDay(localDateIso(new Date()));
  const startEpoch = todayEpoch - days + 1;

  const out: { label: string; income: number; expenseNeg: number; net: number }[] = [];
  for (let bucketStartEpoch = startEpoch; bucketStartEpoch <= todayEpoch; bucketStartEpoch += bucketDays) {
    const bucketEndEpoch = Math.min(bucketStartEpoch + bucketDays - 1, todayEpoch);
    const startIso = epochDayToIso(bucketStartEpoch);
    const endIso = epochDayToIso(bucketEndEpoch);

    let income = 0;
    let expense = 0;
    for (const e of entries) {
      if (e.date < startIso || e.date > endIso) continue;
      if (e.amount >= 0) income += e.amount;
      else expense += Math.abs(e.amount);
    }

    // Labeled by the bucket's END date, not its start — a multi-day bucket
    // labeled by its start date made the most recent bar look days older
    // than the transactions it actually included (e.g. a bucket spanning
    // 07-26..08-01 labeled "07-26" reads as if 08-01 isn't in the chart at
    // all, even though its amount is correctly summed into that bar).
    const label =
      bucketDays === 30
        ? new Date(bucketEndEpoch * 86400000).toLocaleDateString(undefined, { month: "short" })
        : formatDayMonth(endIso);

    out.push({
      label,
      income: Math.round(income * 100) / 100,
      expenseNeg: -Math.round(expense * 100) / 100,
      net: Math.round((income - expense) * 100) / 100,
    });
  }
  return out;
}

/** New student enrollments per calendar month, last N months. */
function studentsPerMonth(students: Student[], months: number) {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  for (const s of students) {
    if (!s.createdAt) continue;
    const d = new Date(s.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([key, count]) => ({ month: key.slice(5), count }));
}

/** Every student grouped by plan, subdivided by their class group where set (e.g. "Main Course – Group A" vs plain "Main Course" for anyone without a group yet). */
function studentsByPlanGroup(students: Student[]) {
  const map = new Map<string, number>();
  for (const s of students) {
    const planLabel = s.plan ?? "No Plan";
    const label = s.classGroup ? `${planLabel} – ${s.classGroup}` : planLabel;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export default function OverviewPage() {
  const { data: students, loading: studentsLoading, lastUpdated: studentsUpdated } = useFirestoreCollection<Student>(
    "students",
    { orderByField: "name" }
  );
  const { data: transactions, loading: financeLoading, lastUpdated: financeUpdated } =
    useFirestoreCollection<FinanceEntry>("transactions", { orderByField: "date", orderByDirection: "desc" });

  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>(30);

  // The week's work sits above every chart on purpose: this page is the
  // first thing opened in the morning, and a KPI you can only read is worth
  // less at 8am than knowing what you're carrying this week.
  const taskStore = useTaskStore();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const today = localDateIso(new Date());
  const onDeck = useMemo(
    () => taskStore.tasks.filter((t) => isOnDeck(t, today)).sort((a, b) => compareTasks(a, b, today)),
    [taskStore.tasks, today]
  );
  // Everything else on the radar — a task due Friday shows here all week.
  const comingUp = useMemo(
    () =>
      taskStore.tasks.filter((t) => isOnRadar(t, today) && !isOnDeck(t, today)).sort((a, b) => compareTasks(a, b, today)),
    [taskStore.tasks, today]
  );
  const days = useMemo(() => weekDates(today), [today]);
  const dayLoad = useMemo(() => {
    const map = new Map<string, Task[]>(days.map((d) => [d, []]));
    for (const t of taskStore.tasks) if (t.status !== "done" && t.due) map.get(t.due)?.push(t);
    return map;
  }, [taskStore.tasks, days]);
  const overdueCount = taskStore.tasks.filter((t) => t.status !== "done" && t.due !== null && t.due < today).length;
  const week = useMemo(() => weekProgress(taskStore.tasks, today), [taskStore.tasks, today]);
  const knownTags = useMemo(() => allTags(taskStore.tasks, taskStore.projects), [taskStore.tasks, taskStore.projects]);

  useEffect(() => {
    fetch("/api/kpis")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed with ${res.status}`);
        }
        return res.json();
      })
      .then(setKpiData)
      .catch((err) => setKpiError(err.message));
  }, []);

  const channelWindowed = useMemo(() => {
    if (!kpiData) return null;
    const half = Math.floor(kpiData.revenue.length / 2);
    const currentRevenue = kpiData.revenue.slice(-half);
    const previousRevenue = kpiData.revenue.slice(0, kpiData.revenue.length - half);
    const currentAds = kpiData.ads.slice(-half);
    const previousAds = kpiData.ads.slice(0, kpiData.ads.length - half);

    return {
      totalRevenue: sum(kpiData.revenue.map((r) => r.revenue)),
      revenueDelta: pctChange(sum(currentRevenue.map((r) => r.revenue)), sum(previousRevenue.map((r) => r.revenue))),
      totalSpend: sum(kpiData.ads.map((a) => a.spend)),
      spendDelta: pctChange(sum(currentAds.map((a) => a.spend)), sum(previousAds.map((a) => a.spend))),
      merged: kpiData.revenue.map((r, i) => ({
        date: formatDayMonth(r.date),
        revenue: r.revenue,
        spend: kpiData.ads[i]?.spend ?? 0,
      })),
    };
  }, [kpiData]);

  const month = useMemo(() => {
    const monthPrefix = localDateIso(new Date()).slice(0, 7);
    let income = 0;
    let expense = 0;
    for (const e of transactions ?? []) {
      if (!e.date.startsWith(monthPrefix)) continue;
      if (e.amount > 0) income += e.amount;
      else expense += Math.abs(e.amount);
    }
    return { income, expense };
  }, [transactions]);

  const activeStudents = (students ?? []).filter((s) => s.status === "active").length;

  const donutData = useMemo(() => expensesByCategory(transactions ?? [], range), [transactions, range]);
  const cashFlowData = useMemo(() => cashFlowBuckets(transactions ?? [], range), [transactions, range]);
  const enrollmentData = useMemo(() => studentsPerMonth(students ?? [], 6), [students]);
  const planGroupData = useMemo(() => studentsByPlanGroup(students ?? []), [students]);

  // "Action required" = active students who are Pending or Late on tuition
  // — see lib/studentStatus.ts for how those are derived (due date + a
  // 5-day grace window before "late").
  const actionRequiredStudents = useMemo(() => {
    return (students ?? [])
      .filter((s) => s.status === "active" && studentPaymentStatus(s.nextPayment) !== "up_to_date" && s.nextPayment)
      .sort((a, b) => (a.nextPayment ?? "").localeCompare(b.nextPayment ?? ""));
  }, [students]);

  const financeError = !transactions && !financeLoading ? "Couldn't load Finance data." : null;
  const lastUpdated = [studentsUpdated, financeUpdated]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-subtitle">Your business at a glance — live data across every system</div>
        </div>
      </div>

      <LiveBadge lastUpdated={lastUpdated} loading={studentsLoading || financeLoading} />

      {financeError && <FetchFailedState message={financeError} />}

      <div className="ov-grid">
        <div className="ov-main">
          <ErrorBoundary label="the This week panel">
            <section className="today-panel">
              <div className="today-head">
                <div className="week-panel-hero">
                  <ProgressRing pct={week.pct} size={56} label={`${week.pct}% of this week's work done`} />
                  <div>
                    <h2 className="section-title" style={{ margin: 0 }}>
                      This week
                    </h2>
                    <div className="today-sub">
                      {formatDateDMY(today)} · {week.done} done since Monday · {week.open} to go
                    </div>
                  </div>
                </div>
                <Link href="/tasks" className="section-link">
                  Plan the week →
                </Link>
              </div>

              {/* The week's load at a glance: one cell per day, a dot per
                  open task, so a crowded Thursday is visible on Monday. */}
              <div className="week-strip">
                {overdueCount > 0 && (
                  <div className="week-strip-cell week-strip-late">
                    <span className="week-strip-day">Late</span>
                    <span className="week-strip-count">{overdueCount}</span>
                    <span className="week-strip-dots" />
                  </div>
                )}
                {days.map((d, i) => {
                  const list = dayLoad.get(d) ?? [];
                  return (
                    <div key={d} className={`week-strip-cell${i === 0 ? " week-strip-today" : ""}`}>
                      <span className="week-strip-day">{i === 0 ? "Today" : weekdayShort(d)}</span>
                      <span className="week-strip-count">{list.length}</span>
                      <span className="week-strip-dots">
                        {list.slice(0, 6).map((t) => (
                          <i key={t.id} className={`dot-${t.status === "doing" ? "doing" : t.priority.toLowerCase()}`} />
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>

              <TaskCapture
                compact
                projects={taskStore.projects.filter((p) => !p.archived)}
                knownTags={knownTags}
                defaultDue={today}
                onCreate={async (fields) => {
                  const created = await taskStore.create(fields);
                  if (created) setEditingTask(created);
                }}
                placeholder="Add a task — type &quot;fri&quot; or &quot;tomorrow&quot; to schedule it"
              />

              <div className="week-panel-cols">
                {[
                  { key: "now", label: "Now", hint: "In progress, overdue and due today", list: onDeck },
                  { key: "next", label: "Coming up", hint: "The rest of the next seven days", list: comingUp },
                ].map((col) => (
                  <div key={col.key} className="week-panel-col">
                    <div className="task-section-head">
                      <h3 className="week-panel-label" title={col.hint}>
                        {col.label}
                      </h3>
                      <span className="task-section-count">{col.list.length}</span>
                    </div>
                    {col.list.length === 0 ? (
                      <p className="week-col-empty">
                        {col.key === "now" ? "Nothing due today — pull something forward." : "Nothing else scheduled this week."}
                      </p>
                    ) : (
                      <div className="task-column-list">
                        {col.list.slice(0, 6).map((task, i) => (
                          <div key={task.id} className="task-grid-item" style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}>
                            <TaskCard
                              compact
                              task={task}
                              project={taskStore.projects.find((p) => p.id === task.projectId)}
                              onToggleDone={taskStore.toggleDone}
                              onToggleDoing={taskStore.toggleDoing}
                              onPatch={taskStore.patch}
                              onOpen={setEditingTask}
                              onDelete={taskStore.remove}
                            />
                          </div>
                        ))}
                        {col.list.length > 6 && (
                          <Link href="/tasks" className="today-more">
                            + {col.list.length - 6} more →
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </ErrorBoundary>

          {/* Four charts as a 2x2 grid rather than a stack, so the whole
              picture fits in about one screen below the week panel. */}
          <div className="ov-charts">
            <section className="card ov-chart">
              <div className="ov-chart-head">
                <h2 className="section-title">Cash flow</h2>
                <select value={range} onChange={(e) => setRange(Number(e.target.value) as RangeOption)} aria-label="Range">
                  {RANGE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      Last {r} days
                    </option>
                  ))}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={cashFlowData}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--ink-soft)" fontSize={11} />
                  <YAxis stroke="var(--ink-soft)" fontSize={11} width={44} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                      name === "expenseNeg" ? "Expense" : "Income",
                    ]}
                  />
                  <Bar dataKey="income" fill="var(--splash)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenseNeg" fill="var(--bubble)" radius={[0, 0, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="card ov-chart">
              <div className="ov-chart-head">
                <h2 className="section-title">Channel trend</h2>
                <span className="section-meta">Revenue vs ad spend</span>
              </div>
              {kpiError && <FetchFailedState message={kpiError} />}
              {!kpiError && !channelWindowed && <div className="state-box">Loading channel KPIs…</div>}
              {!kpiError && channelWindowed && (
                <ErrorBoundary label="the channel trend chart">
                  <ResponsiveContainer width="100%" height={CHART_H}>
                    <LineChart data={channelWindowed.merged}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--ink-soft)" fontSize={11} />
                      <YAxis stroke="var(--ink-soft)" fontSize={11} width={44} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--mango-ink)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="spend" name="Ad spend" stroke="var(--sky-ink)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ErrorBoundary>
              )}
            </section>

            <section className="card ov-chart">
              <div className="ov-chart-head">
                <h2 className="section-title">Expenses by category</h2>
                <span className="section-meta">Last {range} days</span>
              </div>
              {donutData.length === 0 ? (
                <EmptyState title="No expenses in this range" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="category" innerRadius={48} outerRadius={74} paddingAngle={2}>
                      {donutData.map((d, i) => (
                        <Cell key={d.category} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="card ov-chart">
              <div className="ov-chart-head">
                <h2 className="section-title">New students / month</h2>
                <span className="section-meta">Last 6 months</span>
              </div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={enrollmentData}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--ink-soft)" fontSize={11} />
                  <YAxis stroke="var(--ink-soft)" fontSize={11} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="var(--splash)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>
        </div>

        <aside className="ov-side">
          <ErrorBoundary label="the Overview side rail">
            <div className="ov-side-title">This month</div>
            <div className="grid grid-kpis-side">
              <KpiCard label="Revenue" value={money(month.income)} />
              <KpiCard label="Expenses" value={money(month.expense)} />
              <KpiCard label="Net" value={money(month.income - month.expense)} highlight />
              <KpiCard label="Active students" value={String(activeStudents)} />
            </div>

            {!kpiError && kpiData && channelWindowed && (
              <>
                <div className="ov-side-title">Channels</div>
                <div className="grid grid-kpis-side">
                  <KpiCard
                    label="Revenue (Stripe)"
                    value={`$${channelWindowed.totalRevenue.toLocaleString()}`}
                    delta={{ pct: channelWindowed.revenueDelta, label: "vs prior" }}
                    demo={kpiData.sources.revenue === "demo"}
                  />
                  <KpiCard
                    label="Ad spend"
                    value={`$${channelWindowed.totalSpend.toFixed(2)}`}
                    delta={{ pct: channelWindowed.spendDelta, label: "vs prior" }}
                    demo={kpiData.sources.ads === "demo"}
                  />
                </div>
              </>
            )}

            {/* Who needs chasing: a compact list instead of a full-width
                table, so the exception sits beside the numbers it affects. */}
            <div className="ov-side-head">
              <div className="ov-side-title">
                Action required{actionRequiredStudents.length > 0 ? ` · ${actionRequiredStudents.length}` : ""}
              </div>
              <Link href="/students" className="section-link">
                Students →
              </Link>
            </div>
            <div className="card ov-list">
              {actionRequiredStudents.length === 0 ? (
                <p className="ov-list-empty">Every active student is up to date.</p>
              ) : (
                <>
                  {actionRequiredStudents.slice(0, 6).map((s) => {
                    const status = studentPaymentStatus(s.nextPayment);
                    return (
                      <div key={s.id} className="ov-list-row">
                        <div className="ov-list-main">
                          <span className="ov-list-name">{s.name}</span>
                          <span className="ov-list-sub">
                            {s.tuition !== undefined ? `$${s.tuition.toLocaleString()} · ` : ""}due {formatDateDMY(s.nextPayment)}
                          </span>
                        </div>
                        <span className={`badge ${PAYMENT_STATUS_BADGE_CLASS[status]}`}>{PAYMENT_STATUS_LABEL[status]}</span>
                      </div>
                    );
                  })}
                  {actionRequiredStudents.length > 6 && (
                    <Link href="/students" className="today-more">
                      + {actionRequiredStudents.length - 6} more →
                    </Link>
                  )}
                </>
              )}
            </div>

            {/* Plan mix as ranked bars: reads faster than a donut and costs a third of the height. */}
            {planGroupData.length > 0 && (
              <>
                <div className="ov-side-title">Students by plan</div>
                <div className="card ov-list">
                  {planGroupData.map((p) => (
                    <div key={p.name} className="ov-bar-row">
                      <div className="ov-bar-label">
                        <span>{p.name}</span>
                        <strong>{p.value}</strong>
                      </div>
                      <div className="ov-bar-track">
                        <span style={{ transform: `scaleX(${p.value / planGroupData[0].value})` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ErrorBoundary>
        </aside>
      </div>

      {editingTask && (
        <TaskEditModal
          task={taskStore.tasks.find((t) => t.id === editingTask.id) ?? editingTask}
          projects={taskStore.projects.filter((p) => !p.archived)}
          knownTags={knownTags}
          onPatch={taskStore.patch}
          onClose={() => setEditingTask(null)}
        />
      )}
    </main>
  );
}
