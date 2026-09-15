export default function KpiCard({
  label,
  value,
  delta,
  demo,
  highlight,
}: {
  label: string;
  value: string;
  delta?: { pct: number; label: string };
  /** Marks a card as showing placeholder data (no live integration connected yet). */
  demo?: boolean;
  /** Visually emphasizes this card as the headline figure among a group (e.g. Net among Income/Expense). */
  highlight?: boolean;
}) {
  return (
    <div className={`card kpi-card${highlight ? " kpi-card-highlight" : ""}`}>
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
