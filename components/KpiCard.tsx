export default function KpiCard({
  label,
  value,
  delta,
  demo,
}: {
  label: string;
  value: string;
  delta?: { pct: number; label: string };
  /** Marks a card as showing placeholder data (no live integration connected yet). */
  demo?: boolean;
}) {
  return (
    <div className="card kpi-card">
      <div className="kpi-label">
        {label} {demo && <span className="badge badge-warning">Demo data</span>}
      </div>
      <div className="kpi-value">{value}</div>
      {delta && (
        <div className={`kpi-delta ${delta.pct >= 0 ? "up" : "down"}`}>
          {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct).toFixed(1)}% {delta.label}
        </div>
      )}
    </div>
  );
}
