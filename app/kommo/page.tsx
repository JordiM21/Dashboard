"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import ErrorBoundary from "@/components/ErrorBoundary";
import KpiCard from "@/components/KpiCard";
import ViewToggle from "@/components/ViewToggle";
import LoadingLabel from "@/components/LoadingLabel";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { authFetch } from "@/lib/firebase/authFetch";
import { addDays, formatDateDMY, formatDayMonth, localDateIso } from "@/lib/dateUtils";
import type { KommoLeadDetailed, KommoPipeline } from "@/lib/types";

/**
 * Kommo — a read-only sales monitor.
 *
 * Deliberately not a working surface: no drag-and-drop board, no editing,
 * no per-lead actions. Kommo itself is where leads get worked; this page
 * answers "how is the pipeline doing right now" in one screen, so
 * everything here is either a number, a comparison against the previous
 * period of the same length, or a short list you read and move on from.
 */

// Kommo/amoCRM reserve two status ids across every pipeline: 142 is the
// "won" terminal stage and 143 the "lost" one. Every other status id is a
// user-defined stage in that pipeline's own order.
const WON_STATUS_ID = 142;
const LOST_STATUS_ID = 143;

type PeriodKey = "this-month" | "last-month" | "last-90" | "all";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

interface Period {
  start: string | null; // null = unbounded ("All time")
  end: string | null;
  label: string;
}

function periodFor(key: PeriodKey, today = new Date()): Period {
  switch (key) {
    case "this-month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: localDateIso(start), end: localDateIso(today), label: "this month" };
    }
    case "last-month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: localDateIso(start), end: localDateIso(end), label: "last month" };
    }
    case "last-90":
      return { start: addDays(localDateIso(today), -89), end: localDateIso(today), label: "the last 90 days" };
    case "all":
      return { start: null, end: null, label: "all time" };
  }
}

/** The window of equal length immediately before `period` — what every delta compares against. Null for "All time", which has nothing to compare to. */
function precedingPeriod(period: Period): Period | null {
  if (!period.start || !period.end) return null;
  const lengthDays = Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000) + 1;
  return {
    start: addDays(period.start, -lengthDays),
    end: addDays(period.start, -1),
    label: "previous period",
  };
}

function inPeriod(lead: KommoLeadDetailed, period: Period): boolean {
  const day = lead.createdAt.slice(0, 10);
  if (period.start && day < period.start) return false;
  if (period.end && day > period.end) return false;
  return true;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

interface Totals {
  count: number;
  won: number;
  lost: number;
  wonValue: number;
  openValue: number;
}

function totalsFor(leads: KommoLeadDetailed[]): Totals {
  let won = 0;
  let lost = 0;
  let wonValue = 0;
  let openValue = 0;
  for (const l of leads) {
    if (l.statusId === WON_STATUS_ID) {
      won++;
      wonValue += l.price;
    } else if (l.statusId === LOST_STATUS_ID) {
      lost++;
    } else {
      openValue += l.price;
    }
  }
  return { count: leads.length, won, lost, wonValue, openValue };
}

/** Leads created per bucket across the period — daily up to ~6 weeks, weekly beyond, so the bar count stays readable at any range. */
function leadFlow(leads: KommoLeadDetailed[], period: Period): { label: string; leads: number; won: number }[] {
  const days = leads.map((l) => l.createdAt.slice(0, 10)).sort();
  const startIso = period.start ?? days[0];
  const endIso = period.end ?? days[days.length - 1];
  if (!startIso || !endIso) return [];

  const totalDays = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86400000) + 1;
  const bucketDays = totalDays <= 45 ? 1 : totalDays <= 200 ? 7 : 30;

  const out: { label: string; leads: number; won: number }[] = [];
  for (let offset = 0; offset < totalDays; offset += bucketDays) {
    const bucketStart = addDays(startIso, offset);
    const bucketEnd = addDays(startIso, Math.min(offset + bucketDays - 1, totalDays - 1));
    const inBucket = leads.filter((l) => {
      const d = l.createdAt.slice(0, 10);
      return d >= bucketStart && d <= bucketEnd;
    });
    out.push({
      label: formatDayMonth(bucketEnd),
      leads: inBucket.length,
      won: inBucket.filter((l) => l.statusId === WON_STATUS_ID).length,
    });
  }
  return out;
}

export default function KommoPage() {
  const [leads, setLeads] = useState<KommoLeadDetailed[] | null>(null);
  const [pipelines, setPipelines] = useState<KommoPipeline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");

  function load() {
    setLoading(true);
    authFetch("/api/kommo")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed with ${res.status}`);
        return body as { leads: KommoLeadDetailed[]; pipelines: KommoPipeline[] };
      })
      .then((body) => {
        setLeads(body.leads);
        setPipelines(body.pipelines);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const period = useMemo(() => periodFor(periodKey), [periodKey]);
  const previous = useMemo(() => precedingPeriod(period), [period]);

  const scoped = useMemo(
    () => (leads ?? []).filter((l) => pipelineFilter === "all" || String(l.pipelineId) === pipelineFilter),
    [leads, pipelineFilter]
  );

  const current = useMemo(() => scoped.filter((l) => inPeriod(l, period)), [scoped, period]);
  const prior = useMemo(() => (previous ? scoped.filter((l) => inPeriod(l, previous)) : []), [scoped, previous]);

  const now = useMemo(() => totalsFor(current), [current]);
  const before = useMemo(() => totalsFor(prior), [prior]);

  const winRate = now.won + now.lost > 0 ? (now.won / (now.won + now.lost)) * 100 : 0;
  const priorWinRate = before.won + before.lost > 0 ? (before.won / (before.won + before.lost)) * 100 : 0;
  const avgDeal = now.won > 0 ? now.wonValue / now.won : 0;

  // Open value is a snapshot of the whole pipeline as it stands today, not
  // a period measurement — a lead created last year that's still open is
  // money still on the table, so this deliberately ignores the period.
  const openNow = useMemo(() => totalsFor(scoped).openValue, [scoped]);

  const flow = useMemo(() => leadFlow(current, period), [current, period]);

  const stages = useMemo(() => {
    const relevant =
      pipelineFilter === "all"
        ? pipelines.flatMap((p) => p.statuses.map((s) => ({ ...s, pipeline: p.name })))
        : (pipelines.find((p) => String(p.id) === pipelineFilter)?.statuses ?? []).map((s) => ({ ...s, pipeline: "" }));

    // Open leads only: a stage bar is "who is sitting here right now",
    // which is a live snapshot question, not a period one.
    const open = scoped.filter((l) => l.statusId !== WON_STATUS_ID && l.statusId !== LOST_STATUS_ID);
    return relevant
      .filter((s) => s.id !== WON_STATUS_ID && s.id !== LOST_STATUS_ID)
      .map((s) => {
        const here = open.filter((l) => l.statusId === s.id);
        return { id: s.id, name: s.name, pipeline: s.pipeline, count: here.length, value: here.reduce((sum, l) => sum + l.price, 0) };
      })
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [pipelines, pipelineFilter, scoped]);

  const maxStage = stages[0]?.count ?? 1;

  const topTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of current) for (const t of l.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [current]);

  const latest = useMemo(
    () => [...current].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [current]
  );

  // No comparison window (All time), or nothing on either side of it — a
  // "▲ 0.0%" against two zeros is noise dressed up as a measurement.
  // No comparison window (All time), or nothing on either side of it — a
  // "▲ 0.0%" against two zeros is noise dressed up as a measurement.
  const delta = (curr: number, prev: number) =>
    previous && !(curr === 0 && prev === 0) ? { pct: pctChange(curr, prev), label: "vs previous period" } : undefined;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Kommo</div>
          <div className="page-subtitle">Sales pipeline health — read-only</div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <LoadingLabel loading={loading}>↻ Refresh</LoadingLabel>
        </button>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the Kommo monitor">
          <div className="control-bar">
            <ViewToggle value={periodKey} onChange={setPeriodKey} options={PERIOD_OPTIONS} />
            {pipelines.length > 1 && (
              <select value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value)}>
                <option value="all">All pipelines</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-kpis grid-kpis-3">
            <KpiCard label="New leads" value={String(now.count)} delta={delta(now.count, before.count)} />
            <KpiCard label="Won" value={String(now.won)} delta={delta(now.won, before.won)} />
            <KpiCard label="Win rate" value={`${winRate.toFixed(0)}%`} delta={delta(winRate, priorWinRate)} />
            <KpiCard label="Won value" value={usd(now.wonValue)} delta={delta(now.wonValue, before.wonValue)} />
            <KpiCard label="Avg deal" value={usd(avgDeal)} />
            <KpiCard label="Open pipeline" value={usd(openNow)} />
          </div>
          <p className="metric-note">
            New leads, Won, Win rate and Won value cover {period.label}
            {previous ? ", compared against the equally long window before it" : ""}. Avg deal is won value ÷ won
            count. Open pipeline is every lead still in play today, whenever it came in.
          </p>

          {loading && !leads && <div className="state-box">Loading pipeline…</div>}

          {leads && now.count === 0 && (
            <EmptyState title={`No leads in ${period.label}`} hint="Pick a wider period to see more." />
          )}

          {/* A single bucket (a period one day long) or an all-zero series is a
              chart with nothing to compare — the KPI strip already said it. */}
          {flow.length > 1 && flow.some((b) => b.leads > 0) && (
            <>
              <h2 className="section-title">Lead flow</h2>
              <div className="card card-pad">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={flow}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--ink-soft)" fontSize={12} tickLine={false} />
                    <YAxis stroke="var(--ink-soft)" fontSize={12} allowDecimals={false} width={28} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(125,125,125,0.08)" }}
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", background: "var(--white)", color: "var(--ink)" }}
                    />
                    <Bar dataKey="leads" name="New leads" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="won" name="Won" fill="var(--success)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <div className="grid grid-cards" style={{ marginTop: 30 }}>
            <div>
              <h2 className="section-title">Open leads by stage</h2>
              <div className="card card-pad">
                {stages.length === 0 ? (
                  <EmptyState title="No open leads" />
                ) : (
                  <div className="stage-list">
                    {stages.map((s) => (
                      <div key={`${s.pipeline}-${s.id}`} className="stage-row">
                        <div className="stage-row-head">
                          <span className="stage-row-name">
                            {s.name}
                            {s.pipeline && <span className="stage-row-pipeline"> · {s.pipeline}</span>}
                          </span>
                          <span className="stage-row-count">
                            {s.count} <span className="stage-row-value">{usd(s.value)}</span>
                          </span>
                        </div>
                        <div className="stage-row-track">
                          <div className="stage-row-bar" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="section-title">Top tags</h2>
              <div className="card card-pad">
                {topTags.length === 0 ? (
                  <EmptyState title="No tags on these leads" />
                ) : (
                  <div className="stage-list">
                    {topTags.map((t) => (
                      <div key={t.tag} className="stage-row">
                        <div className="stage-row-head">
                          <span className="stage-row-name">{t.tag}</span>
                          <span className="stage-row-count">{t.count}</span>
                        </div>
                        <div className="stage-row-track">
                          <div
                            className="stage-row-bar stage-row-bar-soft"
                            style={{ width: `${(t.count / topTags[0].count) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {latest.length > 0 && (
            <>
              <h2 className="section-title">Latest leads</h2>
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Stage</th>
                      <th>Value</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.map((lead) => (
                      <tr key={lead.id}>
                        <td>{lead.name}</td>
                        <td>
                          <span
                            className={`badge ${
                              lead.statusId === WON_STATUS_ID
                                ? "badge-active"
                                : lead.statusId === LOST_STATUS_ID
                                  ? "badge-inactive"
                                  : "badge-info"
                            }`}
                          >
                            {lead.statusName}
                          </span>
                        </td>
                        <td>{usd(lead.price)}</td>
                        <td>{formatDateDMY(lead.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ErrorBoundary>
      )}
    </main>
  );
}
