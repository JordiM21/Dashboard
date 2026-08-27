import type { CSSProperties } from "react";

/** Small circular loading indicator — inherits the surrounding text color via currentColor, so it looks right on every button variant (primary/secondary/ghost/danger) and in dark mode without its own color prop. */
export default function Spinner({ size = 15, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.7s linear infinite", ...style }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
