/** A donut that fills to `pct`; the stroke-dashoffset transition in CSS is the animation. */
export default function ProgressRing({ pct, size = 56, label }: { pct: number; size?: number; label?: string }) {
  const r = 15.9155; // circumference of exactly 100, so dash lengths are percentages
  return (
    <div className="progress-ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${pct}% done`}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle className="progress-ring-track" cx="18" cy="18" r={r} />
        <circle className="progress-ring-fill" cx="18" cy="18" r={r} strokeDasharray={`${pct} 100`} />
      </svg>
      <span className="progress-ring-value">{pct}%</span>
    </div>
  );
}
