"use client";

import { useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import type { AgentDoc } from "@/lib/types";

export default function AgentsPage() {
  const { data, error, loading, lastUpdated } = useFirestoreCollection<AgentDoc>("agents", {
    orderByField: "name",
  });
  const docs = data ?? [];
  const [statusFilter, setStatusFilter] = useState<"all" | AgentDoc["status"]>("all");

  const filtered = useMemo(
    () => docs.filter((d) => statusFilter === "all" || d.status === statusFilter),
    [docs, statusFilter]
  );

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Agents</div>
          <div className="page-subtitle">Scheduled AI agents, backed by Firestore</div>
        </div>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the agents directory">
          <LiveBadge lastUpdated={lastUpdated} loading={loading} />

          <div className="filter-bar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="error">Error</option>
            </select>
          </div>

          {data && filtered.length === 0 && (
            <EmptyState title="No agents match" hint="Run scripts/migrateMarkdownToFirebase.ts to seed agents." />
          )}

          <div className="grid grid-cards">
            {filtered.map((doc) => (
              <div key={doc.id} className="card card-pad">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700 }}>{doc.name}</div>
                  <span className={`badge badge-${doc.status}`}>{doc.status}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>{doc.role}</div>
                <div style={{ fontSize: 13, marginTop: 10 }}>
                  <span className="tag">{doc.model}</span> <span className="tag">effort: {doc.effort}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 8, color: "var(--ink-soft)" }}>
                  Schedule: <code>{doc.schedule}</code>
                </div>
                <p style={{ fontSize: 13, marginTop: 10 }}>{doc.summary}</p>
              </div>
            ))}
          </div>
        </ErrorBoundary>
      )}
    </main>
  );
}
