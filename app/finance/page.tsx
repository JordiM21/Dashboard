"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import KpiCard from "@/components/KpiCard";
import ViewToggle from "@/components/ViewToggle";
import AddTransactionModal from "@/components/AddTransactionModal";
import AddRecurringModal from "@/components/AddRecurringModal";
import ConfirmModal from "@/components/ConfirmModal";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import { summarizeFinance } from "@/lib/finance";
import { formatDateDMY } from "@/lib/dateUtils";
import type { FinanceEntry, Student, RecurringTransaction } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  manual: "🖊 Manual",
  stripe: "💳 Stripe",
  recurring: "🔁 Recurring",
};

// `amount` is always USD (Stripe's own converted settlement figure for
// Stripe rows — see paymentReceiver.ts / backfillStripeTransactions.ts),
// so every total on this page blends cleanly across all entries.
const money = (n: number) =>
  `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const DATE_RANGES = {
  all: { label: "All time", days: null },
  "7": { label: "Last 7 days", days: 7 },
  "30": { label: "Last 30 days", days: 30 },
  "90": { label: "Last 90 days", days: 90 },
} as const;
type DateRangeKey = keyof typeof DATE_RANGES;

function originalAmountLabel(e: FinanceEntry): string | null {
  if (!e.originalCurrency || e.originalAmount === undefined) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: e.originalCurrency.toUpperCase(),
    }).format(e.originalAmount);
  } catch {
    return `${e.originalAmount.toLocaleString()} ${e.originalCurrency.toUpperCase()}`;
  }
}

export default function FinancePage() {
  const { data, error, loading, lastUpdated } = useFirestoreCollection<FinanceEntry>("transactions", {
    orderByField: "date",
    orderByDirection: "desc",
  });
  const { data: students } = useFirestoreCollection<Student>("students", { orderByField: "name" });
  const { data: recurring } = useFirestoreCollection<RecurringTransaction>("recurringTransactions", {
    orderByField: "nextPayment",
  });

  const [view, setView] = useState<"table" | "graph">("table");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "Income" | "Expense">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "stripe" | "recurring">("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinanceEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<FinanceEntry | "selected" | null>(null);
  const [addRecurringOpen, setAddRecurringOpen] = useState(false);
  const [deleteRecurringTarget, setDeleteRecurringTarget] = useState<RecurringTransaction | null>(null);
  const [runningRecurring, setRunningRecurring] = useState(false);
  const [recurringRunMessage, setRecurringRunMessage] = useState<string | null>(null);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students ?? []) map.set(s.id, s.name);
    return map;
  }, [students]);

  const categories = useMemo(() => Array.from(new Set((data ?? []).map((e) => e.category))), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rangeDays = DATE_RANGES[dateRange].days;
    const earliestDate = rangeDays
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - rangeDays);
          return d.toISOString().slice(0, 10);
        })()
      : null;
    const q = search.trim().toLowerCase();

    return data.filter((e) => {
      const matchesType = typeFilter === "all" || e.type === typeFilter;
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      const matchesSource = sourceFilter === "all" || (e.source ?? "manual") === sourceFilter;
      const matchesStudent = studentFilter === "all" || e.studentId === studentFilter;
      const matchesDate = !earliestDate || e.date >= earliestDate;
      const matchesSearch =
        !q ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.studentId && studentNameById.get(e.studentId)?.toLowerCase().includes(q));
      return matchesType && matchesCategory && matchesSource && matchesStudent && matchesDate && matchesSearch;
    });
  }, [data, typeFilter, categoryFilter, sourceFilter, studentFilter, dateRange, search, studentNameById]);

  // KPIs and the category chart reflect the filtered set, so narrowing
  // down (e.g. to one student, or the last 30 days) updates the totals too.
  const summary = useMemo(() => summarizeFinance(filtered), [filtered]);

  async function toggleRecurringActive(r: RecurringTransaction) {
    await authFetch(`/api/finance/recurring/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
  }

  async function confirmDeleteRecurring() {
    if (!deleteRecurringTarget) return;
    await authFetch(`/api/finance/recurring/${deleteRecurringTarget.id}`, { method: "DELETE" });
    setDeleteRecurringTarget(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id))));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const ids = deleteTarget === "selected" ? Array.from(selectedIds) : [deleteTarget.id];
    await Promise.all(ids.map((id) => authFetch(`/api/finance/${id}`, { method: "DELETE" })));
    setSelectedIds(new Set());
    setDeleteTarget(null);
  }

  async function runRecurringNow() {
    setRunningRecurring(true);
    setRecurringRunMessage(null);
    try {
      const res = await authFetch("/api/cron/recurring-payments", { method: "POST" });
      const raw = await res.text();
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(body.message ?? body.error ?? `Request failed with ${res.status}`);
      setRecurringRunMessage(
        body.triggered === 0 ? "Nothing due today." : `Triggered ${body.triggered} payment${body.triggered === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setRecurringRunMessage(err instanceof Error ? err.message : "Failed to run.");
    } finally {
      setRunningRecurring(false);
    }
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Income &amp; Revenue</div>
          <div className="page-subtitle">Live ledger, backed by Firestore — all amounts in USD</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setAddRecurringOpen(true)}>
            + Add Recurring
          </button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            + Add Transaction
          </button>
        </div>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the finance ledger">
          <LiveBadge lastUpdated={lastUpdated} loading={loading} />

          {data && (
            <div className="grid grid-kpis" style={{ marginTop: 16, marginBottom: 20 }}>
              <KpiCard label="Total Income" value={money(summary.totalIncome)} />
              <KpiCard label="Total Expense" value={money(summary.totalExpense)} />
              <KpiCard label="Net" value={money(summary.net)} />
              <KpiCard label="Entries" value={String(filtered.length)} />
            </div>
          )}

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search description, category, student…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
              <option value="all">All entries</option>
              <option value="Income">Income only</option>
              <option value="Expense">Expense only</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)}>
              <option value="all">All sources</option>
              <option value="manual">🖊 Manual only</option>
              <option value="stripe">💳 Stripe only</option>
              <option value="recurring">🔁 Recurring only</option>
            </select>
            <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
              <option value="all">All students</option>
              {(students ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRangeKey)}>
              {Object.entries(DATE_RANGES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: "Table" },
                { value: "graph", label: "By category" },
              ]}
            />
          </div>

          {data && filtered.length === 0 && (
            <EmptyState title="No entries match" hint="Try clearing filters, or add a new transaction." />
          )}

          {selectedIds.size > 0 && (
            <div className="filter-bar">
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{selectedIds.size} selected</span>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget("selected")}>
                Delete selected
              </button>
            </div>
          )}

          {view === "graph" && summary.byCategory.length > 0 && (
            <div className="card card-pad">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.byCategory}>
                  <CartesianGrid stroke="#e9ddce" vertical={false} />
                  <XAxis dataKey="category" stroke="#7a6a5e" fontSize={12} />
                  <YAxis stroke="#7a6a5e" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }} />
                  <Bar dataKey="net" radius={[6, 6, 0, 0]}>
                    {summary.byCategory.map((c) => (
                      <Cell key={c.category} fill={c.net >= 0 ? "#6fae7c" : "#d96060"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {view === "table" && filtered.length > 0 && (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Student</th>
                    <th>Original</th>
                    <th>Source</th>
                    <th>Amount (USD)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const original = originalAmountLabel(e);
                    return (
                      <tr key={e.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(e.id)}
                            onChange={() => toggleSelected(e.id)}
                            aria-label={`Select ${e.description || e.date}`}
                          />
                        </td>
                        <td>{formatDateDMY(e.date)}</td>
                        <td>{e.description}</td>
                        <td>
                          <span className="tag">{e.category}</span>
                        </td>
                        <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                          {e.studentId ? studentNameById.get(e.studentId) ?? "—" : "—"}
                        </td>
                        <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>{original ?? "—"}</td>
                        <td>
                          <span className={`badge badge-source-${e.source ?? "manual"}`}>
                            {SOURCE_LABEL[e.source ?? "manual"]}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: e.amount >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {money(e.amount)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingEntry(e)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(e)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ErrorBoundary>
      )}

      <h2 className="section-title">Recurring Payments</h2>
      <div className="filter-bar">
        <button className="btn btn-secondary btn-sm" onClick={runRecurringNow} disabled={runningRecurring}>
          {runningRecurring ? "Running…" : "▶ Run due payments now"}
        </button>
        {recurringRunMessage && (
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{recurringRunMessage}</span>
        )}
      </div>
      {!recurring || recurring.length === 0 ? (
        <EmptyState
          title="No recurring payments set up"
          hint="Add subscriptions or ad-spend budgets that should bill automatically every month."
        />
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Last Payment</th>
                <th>Next Payment</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td>
                    <span className="tag">{r.category}</span>
                  </td>
                  <td>{r.type}</td>
                  <td style={{ fontWeight: 700 }}>${r.amount.toLocaleString()}</td>
                  <td>every {r.frequencyMonths ?? 1} mo</td>
                  <td>{r.lastPayment ? formatDateDMY(r.lastPayment) : "— never —"}</td>
                  <td>{formatDateDMY(r.nextPayment)}</td>
                  <td>
                    <span className={`badge badge-${r.active ? "active" : "paused"}`}>
                      {r.active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleRecurringActive(r)}>
                        {r.active ? "Pause" : "Resume"}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteRecurringTarget(r)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <AddTransactionModal onClose={() => setAddOpen(false)} onCreated={() => {}} />}
      {editingEntry && (
        <AddTransactionModal editing={editingEntry} onClose={() => setEditingEntry(null)} onCreated={() => {}} />
      )}
      {addRecurringOpen && <AddRecurringModal onClose={() => setAddRecurringOpen(false)} onCreated={() => {}} />}

      {deleteTarget && (
        <ConfirmModal
          title={deleteTarget === "selected" ? "Delete selected transactions?" : "Delete transaction?"}
          message={
            deleteTarget === "selected"
              ? `This permanently deletes ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}. This can't be undone.`
              : `This permanently deletes "${deleteTarget.description || deleteTarget.category}" (${money(deleteTarget.amount)}). This can't be undone.`
          }
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deleteRecurringTarget && (
        <ConfirmModal
          title="Delete recurring payment?"
          message={`This stops "${deleteRecurringTarget.description}" from generating any future transactions. Past transactions it already created stay in your ledger. This can't be undone.`}
          onConfirm={confirmDeleteRecurring}
          onCancel={() => setDeleteRecurringTarget(null)}
        />
      )}
    </main>
  );
}
