"use client";

import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import KpiCard from "@/components/KpiCard";
import ViewToggle from "@/components/ViewToggle";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY } from "@/lib/dateUtils";
import type { KommoLeadDetailed, KommoPipeline } from "@/lib/types";

type DatePreset = "all" | "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth";
type SortKey = "newest" | "value" | "name";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "thisMonth", label: "This month" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const mondayOffset = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - mondayOffset);
  return x;
}

function matchesDatePreset(iso: string, preset: DatePreset): boolean {
  if (preset === "all") return true;
  const created = new Date(iso);
  const now = new Date();

  switch (preset) {
    case "today":
      return created >= startOfDay(now);
    case "yesterday": {
      const yStart = new Date(startOfDay(now));
      yStart.setDate(yStart.getDate() - 1);
      return created >= yStart && created < startOfDay(now);
    }
    case "thisWeek":
      return created >= startOfWeek(now);
    case "lastWeek": {
      const lastWeekStart = new Date(startOfWeek(now));
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      return created >= lastWeekStart && created < startOfWeek(now);
    }
    case "thisMonth": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return created >= monthStart;
    }
  }
}

export default function KommoPage() {
  const [leads, setLeads] = useState<KommoLeadDetailed[] | null>(null);
  const [pipelines, setPipelines] = useState<KommoPipeline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<"grid" | "list">("grid");

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

  const allTags = useMemo(
    () => Array.from(new Set((leads ?? []).flatMap((l) => l.tags))).sort(),
    [leads]
  );

  const statusesForFilter = useMemo(() => {
    if (pipelineFilter === "all") return pipelines.flatMap((p) => p.statuses);
    return pipelines.find((p) => String(p.id) === pipelineFilter)?.statuses ?? [];
  }, [pipelines, pipelineFilter]);

  const counts = useMemo(() => {
    const all = leads ?? [];
    const inPreset = (preset: DatePreset) => all.filter((l) => matchesDatePreset(l.createdAt, preset)).length;
    return {
      today: inPreset("today"),
      yesterday: inPreset("yesterday"),
      thisWeek: inPreset("thisWeek"),
      lastWeek: inPreset("lastWeek"),
    };
  }, [leads]);

  const filtered = useMemo(() => {
    let list = (leads ?? []).filter((l) => {
      const matchesPipeline = pipelineFilter === "all" || String(l.pipelineId) === pipelineFilter;
      const matchesStatus = statusFilter === "all" || String(l.statusId) === statusFilter;
      const matchesTag = tagFilter === "all" || l.tags.includes(tagFilter);
      const matchesDate = matchesDatePreset(l.createdAt, datePreset);
      const matchesSearch = !search || l.name.toLowerCase().includes(search.toLowerCase());
      return matchesPipeline && matchesStatus && matchesTag && matchesDate && matchesSearch;
    });
    list = [...list].sort((a, b) => {
      if (sort === "value") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [leads, pipelineFilter, statusFilter, tagFilter, datePreset, search, sort]);

  const totalValue = filtered.reduce((sum, l) => sum + l.price, 0);

  const byStatus = useMemo(() => {
    const map = new Map<number, KommoLeadDetailed[]>();
    for (const l of filtered) map.set(l.statusId, [...(map.get(l.statusId) ?? []), l]);
    return map;
  }, [filtered]);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Kommo Pipeline</div>
          <div className="page-subtitle">Every lead, stage, and tag across your Kommo pipelines</div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the Kommo pipeline">
          <div className="grid grid-kpis" style={{ marginBottom: 20 }}>
            <KpiCard label="Today" value={String(counts.today)} />
            <KpiCard label="Yesterday" value={String(counts.yesterday)} />
            <KpiCard label="This Week" value={String(counts.thisWeek)} />
            <KpiCard label="Last Week" value={String(counts.lastWeek)} />
          </div>

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={pipelineFilter}
              onChange={(e) => {
                setPipelineFilter(e.target.value);
                setStatusFilter("all");
              }}
            >
              <option value="all">All pipelines</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All stages</option>
              {statusesForFilter.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={datePreset} onChange={(e) => setDatePreset(e.target.value as DatePreset)}>
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="newest">Sort: Newest</option>
              <option value="value">Sort: Value</option>
              <option value="name">Sort: Name</option>
            </select>
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "By Stage" },
                { value: "list", label: "List" },
              ]}
            />
          </div>

          {leads && filtered.length === 0 && (
            <EmptyState title="No leads match" hint="Try clearing filters." />
          )}

          {filtered.length > 0 && (
            <div className="page-subtitle" style={{ marginBottom: 14 }}>
              {filtered.length} lead{filtered.length === 1 ? "" : "s"} · ${totalValue.toLocaleString()} total value
            </div>
          )}

          {view === "grid" && filtered.length > 0 && (
            <div className="kanban" style={{ gridTemplateColumns: `repeat(${statusesForFilter.length || 1}, minmax(220px, 1fr))` }}>
              {statusesForFilter.map((status) => (
                <div key={status.id} className="kanban-col">
                  <div className="kanban-col-title">
                    {status.name} <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>({(byStatus.get(status.id) ?? []).length})</span>
                  </div>
                  {(byStatus.get(status.id) ?? []).map((lead) => (
                    <div key={lead.id} className="kanban-card">
                      <div style={{ fontWeight: 600 }}>{lead.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{lead.pipelineName}</div>
                      <div style={{ fontSize: 13, marginTop: 6, fontWeight: 600 }}>${lead.price.toLocaleString()}</div>
                      {lead.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                          {lead.tags.map((t) => (
                            <span key={t} className="tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>
                        {formatDateDMY(lead.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {view === "list" && filtered.length > 0 && (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Pipeline</th>
                    <th>Stage</th>
                    <th>Tags</th>
                    <th>Value</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name}</td>
                      <td>{lead.pipelineName}</td>
                      <td>
                        <span className="badge badge-info">{lead.statusName}</span>
                      </td>
                      <td>
                        {lead.tags.map((t) => (
                          <span key={t} className="tag" style={{ marginRight: 4 }}>
                            {t}
                          </span>
                        ))}
                      </td>
                      <td>${lead.price.toLocaleString()}</td>
                      <td>{formatDateDMY(lead.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ErrorBoundary>
      )}
    </main>
  );
}
