"use client";

import LoadingLabel from "@/components/LoadingLabel";

function timeAgo(date: Date | null) {
  if (!date) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export default function LiveBadge({ lastUpdated, loading }: { lastUpdated: Date | null; loading: boolean }) {
  return (
    <div className="filter-bar" style={{ justifyContent: "flex-start", gap: 8 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: loading ? "var(--ink-soft)" : "var(--success)",
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 13, color: "var(--ink-soft)", position: "relative" }}>
        <LoadingLabel loading={loading}>{`Live — updated ${timeAgo(lastUpdated)}`}</LoadingLabel>
      </span>
    </div>
  );
}
