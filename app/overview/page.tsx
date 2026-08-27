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
import ViewToggle from "@/components/ViewToggle";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import { summarizeFinance } from "@/lib/finance";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_BADGE_CLASS } from "@/lib/studentStatus";
import { formatDateDMY } from "@/lib/dateUtils";
import type { FinanceEntry, Project, ContentItem, Student } from "@/lib/types";
import type { StripeDailyRevenue, StripeBalanceOverview } from "@/lib/api/stripe";
import type { KommoLead } from "@/lib/api/kommo";
import type { MetaAdsSummary } from "@/lib/api/meta";

const PALETTE = ["#d98c5f", "#6fae7c", "#e0a83e", "#c06b3d", "#7a6a5e", "#d96060"];
const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];
const PROJECT_STATUSES: Project["status"][] = ["To Do", "In Progress", "Paused", "Done"];

interface KpiData {
  revenue: StripeDailyRevenue[];
  leads: KommoLead[];
  ads: MetaAdsSummary[];
  sources: { revenue: "live" | "demo"; leads: "live" | "demo"; ads: "live" | "demo" };
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
        : endIso.slice(5);

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

type StudentSort = "name" | "tuition" | "nextPayment";
type ProjectSort = "title" | "priority" | "progress";

export default function OverviewPage() {
  const { data: students, loading: studentsLoading, lastUpdated: studentsUpdated } = useFirestoreCollection<Student>(
    "students",
    { orderByField: "name" }
  );
  const { data: transactions, loading: financeLoading, lastUpdated: financeUpdated } =
    useFirestoreCollection<FinanceEntry>("transactions", { orderByField: "date", orderByDirection: "desc" });
  const { data: projects, loading: projectsLoading, lastUpdated: projectsUpdated } = useFirestoreCollection<Project>(
    "projects",
    { orderByField: "createdAt", orderByDirection: "desc" }
  );
  const { data: content } = useFirestoreCollection<ContentItem>("content", {
    orderByField: "createdAt",
    orderByDirection: "desc",
  });

  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>(30);
  const [stripeBalance, setStripeBalance] = useState<StripeBalanceOverview | null>(null);

  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [studentSort, setStudentSort] = useState<StudentSort>("name");
  const [studentView, setStudentView] = useState<"grid" | "list">("list");

  const [projectFieldFilter, setProjectFieldFilter] = useState("all");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"all" | Project["status"]>("all");
  const [projectSort, setProjectSort] = useState<ProjectSort>("progress");
  const [projectView, setProjectView] = useState<"grid" | "list">("list");

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

    authFetch("/api/stripe/balance")
      .then((res) => (res.ok ? res.json() : null))
      .then(setStripeBalance)
      .catch(() => setStripeBalance(null));
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
        date: r.date.slice(5),
        revenue: r.revenue,
        spend: kpiData.ads[i]?.spend ?? 0,
      })),
    };
  }, [kpiData]);

  const financeSummary = useMemo(() => summarizeFinance(transactions ?? []), [transactions]);

  const thisMonthRevenue = useMemo(() => {
    const monthPrefix = localDateIso(new Date()).slice(0, 7);
    return (transactions ?? [])
      .filter((e) => e.amount > 0 && e.date.startsWith(monthPrefix))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [transactions]);

  const activeStudents = (students ?? []).filter((s) => s.status === "active").length;

  const donutData = useMemo(() => expensesByCategory(transactions ?? [], range), [transactions, range]);
  const cashFlowData = useMemo(() => cashFlowBuckets(transactions ?? [], range), [transactions, range]);
  const enrollmentData = useMemo(() => studentsPerMonth(students ?? [], 6), [students]);
  const planGroupData = useMemo(() => studentsByPlanGroup(students ?? []), [students]);

  const projectStatusCounts = useMemo(() => {
    const counts = new Map(PROJECT_STATUSES.map((s) => [s, 0]));
    for (const p of projects ?? []) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return PROJECT_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  }, [projects]);

  // "Action required" = active students who are Pending or Late on tuition
  // — see lib/studentStatus.ts for how those are derived (due date + a
  // 5-day grace window before "late").
  const actionRequiredStudents = useMemo(() => {
    return (students ?? [])
      .filter((s) => s.status === "active" && studentPaymentStatus(s.nextPayment) !== "up_to_date" && s.nextPayment)
      .sort((a, b) => (a.nextPayment ?? "").localeCompare(b.nextPayment ?? ""));
  }, [students]);

  const filteredStudents = useMemo(() => {
    let list = (students ?? []).filter((s) => {
      const matchesStatus = studentStatusFilter === "all" || s.status === studentStatusFilter;
      const matchesSearch = !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase());
      return matchesStatus && matchesSearch;
    });
    list = [...list].sort((a, b) => {
      if (studentSort === "tuition") return (b.tuition ?? 0) - (a.tuition ?? 0);
      if (studentSort === "nextPayment") return (a.nextPayment ?? "").localeCompare(b.nextPayment ?? "");
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [students, studentSearch, studentStatusFilter, studentSort]);

  const projectFields = useMemo(() => Array.from(new Set((projects ?? []).map((p) => p.field))), [projects]);

  const filteredProjects = useMemo(() => {
    let list = (projects ?? []).filter((p) => {
      const matchesField = projectFieldFilter === "all" || p.field === projectFieldFilter;
      const matchesStatus = projectStatusFilter === "all" || p.status === projectStatusFilter;
      return matchesField && matchesStatus;
    });
    list = [...list].sort((a, b) => {
      if (projectSort === "priority") {
        const order = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
        return order[a.priority] - order[b.priority];
      }
      if (projectSort === "progress") return b.progress - a.progress;
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [projects, projectFieldFilter, projectStatusFilter, projectSort]);

  const financeError = !transactions && !financeLoading ? "Couldn't load Finance data." : null;
  const lastUpdated = [studentsUpdated, financeUpdated, projectsUpdated]
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

      <LiveBadge lastUpdated={lastUpdated} loading={studentsLoading || financeLoading || projectsLoading} />

      {financeError && <FetchFailedState message={financeError} />}

      <ErrorBoundary label="the Overview KPI grid">
        <div className="grid grid-kpis" style={{ marginTop: 16, marginBottom: 12 }}>
          <KpiCard
            label="Ledger Net (all-time)"
            value={`$${financeSummary.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          />
          <KpiCard
            label="Stripe Balance (live)"
            value={stripeBalance ? `$${stripeBalance.availableUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
            demo={!stripeBalance}
          />
          <KpiCard label="Active Students" value={String(activeStudents)} />
          <KpiCard label="Revenue This Month" value={`$${thisMonthRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 20px" }}>
          "Ledger Net" is every transaction recorded here, all-time — a bookkeeping total, not cash in the bank.
          "Stripe Balance" is what Stripe actually holds right now (after fees, holds, and past payouts) — that's the
          one that should match your Stripe dashboard.
        </p>

        {stripeBalance && (
          <div className="card card-pad" style={{ marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div className="kpi-label">Last Payout</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                {stripeBalance.lastPayout
                  ? `$${stripeBalance.lastPayout.amountUsd.toLocaleString()} on ${stripeBalance.lastPayout.date}`
                  : "No payouts yet"}
              </div>
            </div>
            <div>
              <div className="kpi-label">Next Payout</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                ${stripeBalance.availableUsd.toFixed(2)} / ${stripeBalance.payoutThresholdUsd} toward automatic payout
              </div>
              <div className="progress-bar" style={{ width: 220, marginTop: 6 }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.min(100, (stripeBalance.availableUsd / stripeBalance.payoutThresholdUsd) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>

      <div className="filter-bar">
        <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600 }}>Range</span>
        <select value={range} onChange={(e) => setRange(Number(e.target.value) as RangeOption)}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              Last {r} days
            </option>
          ))}
        </select>
      </div>

      <h2 className="section-title">Cash Flow</h2>
      <div className="card card-pad">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={cashFlowData}>
            <CartesianGrid stroke="#e9ddce" vertical={false} />
            <XAxis dataKey="label" stroke="#7a6a5e" fontSize={12} />
            <YAxis stroke="#7a6a5e" fontSize={12} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }}
              formatter={(value: number, name: string) => [
                `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                name === "expenseNeg" ? "Expense" : "Income",
              ]}
            />
            <Bar dataKey="income" fill="#6fae7c" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenseNeg" fill="#d96060" radius={[0, 0, 6, 6]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cards" style={{ marginTop: 30 }}>
        <div>
          <h2 className="section-title">Expenses by Category</h2>
          <div className="card card-pad">
            {donutData.length === 0 ? (
              <EmptyState title="No expenses in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="category" innerRadius={60} outerRadius={92} paddingAngle={2}>
                    {donutData.map((d, i) => (
                      <Cell key={d.category} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }}
                    formatter={(value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div>
          <h2 className="section-title">New Students / Month</h2>
          <div className="card card-pad">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={enrollmentData}>
                <CartesianGrid stroke="#e9ddce" vertical={false} />
                <XAxis dataKey="month" stroke="#7a6a5e" fontSize={12} />
                <YAxis stroke="#7a6a5e" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }} />
                <Bar dataKey="count" fill="#6fae7c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h2 className="section-title">Students by Plan</h2>
          <div className="card card-pad">
            {planGroupData.length === 0 ? (
              <EmptyState title="No students yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={planGroupData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {planGroupData.map((d, i) => (
                      <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <h2 className="section-title">Channel KPIs</h2>
      {kpiError && <FetchFailedState message={kpiError} />}
      {!kpiError && !kpiData && <div className="state-box">Loading channel KPIs…</div>}
      {!kpiError && kpiData && channelWindowed && (
        <ErrorBoundary label="the channel KPI grid">
          <div className="grid grid-kpis" style={{ marginBottom: 16 }}>
            <KpiCard
              label="Revenue (Stripe)"
              value={`$${channelWindowed.totalRevenue.toLocaleString()}`}
              delta={{ pct: channelWindowed.revenueDelta, label: "vs prior period" }}
              demo={kpiData.sources.revenue === "demo"}
            />
            <KpiCard
              label="Leads (Kommo)"
              value={String(kpiData.leads.length)}
              delta={{
                pct: kpiData.leads.length
                  ? (kpiData.leads.filter((l) => l.status === "Won").length / kpiData.leads.length) * 100
                  : 0,
                label: "won rate",
              }}
              demo={kpiData.sources.leads === "demo"}
            />
            <KpiCard
              label="Ad Spend (Meta)"
              value={`$${channelWindowed.totalSpend.toFixed(2)}`}
              delta={{ pct: channelWindowed.spendDelta, label: "vs prior period" }}
              demo={kpiData.sources.ads === "demo"}
            />
          </div>

          <div className="card card-pad">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={channelWindowed.merged}>
                <CartesianGrid stroke="#e9ddce" vertical={false} />
                <XAxis dataKey="date" stroke="#7a6a5e" fontSize={12} />
                <YAxis stroke="#7a6a5e" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }} />
                <Line type="monotone" dataKey="revenue" stroke="#d98c5f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="spend" stroke="#7a6a5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 14 }}>
            <Link href="/kommo" className="btn btn-secondary btn-sm">
              View full Kommo pipeline →
            </Link>
          </div>
        </ErrorBoundary>
      )}

      <h2 className="section-title">Students</h2>
      <ErrorBoundary label="the Students section">
        <div className="filter-bar">
          <input
            type="text"
            placeholder="Search by name…"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
          <select value={studentStatusFilter} onChange={(e) => setStudentStatusFilter(e.target.value as any)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={studentSort} onChange={(e) => setStudentSort(e.target.value as StudentSort)}>
            <option value="name">Sort: Name</option>
            <option value="tuition">Sort: Tuition</option>
            <option value="nextPayment">Sort: Next payment</option>
          </select>
          <ViewToggle
            value={studentView}
            onChange={setStudentView}
            options={[
              { value: "list", label: "List" },
              { value: "grid", label: "Grid" },
            ]}
          />
        </div>

        {students && filteredStudents.length === 0 && (
          <EmptyState title="No students match" hint="Try clearing filters." />
        )}

        {studentView === "list" && filteredStudents.length > 0 && (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Parent Email</th>
                  <th>Tuition</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => {
                  const payStatus = studentPaymentStatus(s.nextPayment);
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.plan ?? "—"}</td>
                      <td>
                        <span className={`badge badge-${s.status}`}>{s.status}</span>
                      </td>
                      <td>
                        <span className={`badge ${PAYMENT_STATUS_BADGE_CLASS[payStatus]}`}>
                          {PAYMENT_STATUS_LABEL[payStatus]}
                        </span>
                      </td>
                      <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>{s.parentEmail ?? "—"}</td>
                      <td>{s.tuition !== undefined ? `$${s.tuition.toLocaleString()}` : "—"}</td>
                      <td>{formatDateDMY(s.nextPayment)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {studentView === "grid" && filteredStudents.length > 0 && (
          <div className="grid grid-cards">
            {filteredStudents.map((s) => (
              <div key={s.id} className="card card-pad">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </div>
                {s.parentEmail && (
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>{s.parentEmail}</div>
                )}
                {(s.tuition !== undefined || s.nextPayment) && (
                  <div style={{ fontSize: 13, marginTop: 8 }}>
                    {s.tuition !== undefined && `Tuition $${s.tuition}`}
                    {s.tuition !== undefined && s.nextPayment && " · "}
                    {s.nextPayment && `Due ${formatDateDMY(s.nextPayment)}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ErrorBoundary>

      <h2 className="section-title">Projects</h2>
      <ErrorBoundary label="the Projects section">
        <div className="filter-bar">
          <select value={projectFieldFilter} onChange={(e) => setProjectFieldFilter(e.target.value)}>
            <option value="all">All fields</option>
            {projectFields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select value={projectStatusFilter} onChange={(e) => setProjectStatusFilter(e.target.value as any)}>
            <option value="all">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={projectSort} onChange={(e) => setProjectSort(e.target.value as ProjectSort)}>
            <option value="progress">Sort: Progress</option>
            <option value="priority">Sort: Priority</option>
            <option value="title">Sort: Title</option>
          </select>
          <ViewToggle
            value={projectView}
            onChange={setProjectView}
            options={[
              { value: "list", label: "List" },
              { value: "grid", label: "Grid" },
            ]}
          />
        </div>

        {projects && filteredProjects.length === 0 && (
          <EmptyState title="No projects match" hint="Try clearing filters." />
        )}

        {projectView === "list" && filteredProjects.length > 0 && (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Field</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.field}</td>
                    <td>
                      <span className={`badge badge-${p.priority.toLowerCase()}`}>{p.priority}</span>
                    </td>
                    <td>{p.status}</td>
                    <td>{p.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {projectView === "grid" && filteredProjects.length > 0 && (
          <div className="grid grid-cards">
            {filteredProjects.map((p) => (
              <div key={p.id} className="card card-pad">
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{p.field}</div>
                <span className={`badge badge-${p.priority.toLowerCase()}`}>{p.priority}</span>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </ErrorBoundary>

      <h2 className="section-title">Projects &amp; Content Status</h2>
      <div className="grid grid-cards">
        {projectStatusCounts.map(({ status, count }) => (
          <div key={status} className="card kpi-card">
            <div className="kpi-label">{status}</div>
            <div className="kpi-value">{count}</div>
          </div>
        ))}
        <div className="card kpi-card">
          <div className="kpi-label">Content Items</div>
          <div className="kpi-value">{content?.length ?? 0}</div>
        </div>
      </div>

      <h2 className="section-title">Action Required</h2>
      {actionRequiredStudents.length === 0 ? (
        <EmptyState title="Nothing needs attention" hint="Every active student is up to date on payments." />
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Plan</th>
                <th>Tuition</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {actionRequiredStudents.map((s) => {
                const status = studentPaymentStatus(s.nextPayment);
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.plan ?? "—"}</td>
                    <td>{s.tuition !== undefined ? `$${s.tuition.toLocaleString()}` : "—"}</td>
                    <td>{formatDateDMY(s.nextPayment)}</td>
                    <td>
                      <span className={`badge ${PAYMENT_STATUS_BADGE_CLASS[status]}`}>
                        {PAYMENT_STATUS_LABEL[status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
