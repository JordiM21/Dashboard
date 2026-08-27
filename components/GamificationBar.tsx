"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { playConfettiChime, playVictoryFanfare, playDrumRoll, playApplause } from "@/lib/soundEffects";

// canvas-confetti appends its own <canvas> to document.body with
// `z-index: 100` by default — invisible behind Screen Share mode's
// `position: fixed` overlay (z-index 10000) and this bar (10001), since
// stacking order for positioned elements follows z-index, not DOM order.
// Every confetti() call below must set this explicitly.
const CONFETTI_Z_INDEX = 100000;

function burstConfetti() {
  const end = Date.now() + 700;
  const colors = ["#d98c5f", "#6fae7c", "#e0a83e", "#c06b3d", "#d96060"];
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.9 }, colors, zIndex: CONFETTI_Z_INDEX });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.9 }, colors, zIndex: CONFETTI_Z_INDEX });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 90, spread: 100, origin: { y: 0.6 }, colors, zIndex: CONFETTI_Z_INDEX });
}

const ACTIONS: { id: string; label: string; icon: string; run: () => void | Promise<void> }[] = [
  {
    id: "confetti",
    label: "Confetti",
    icon: "🎉",
    run: () => {
      burstConfetti();
      playConfettiChime();
    },
  },
  { id: "victory", label: "Victory", icon: "🏆", run: playVictoryFanfare },
  { id: "drumroll", label: "Drum Roll", icon: "🥁", run: playDrumRoll },
  { id: "applause", label: "Applause", icon: "👏", run: playApplause },
];

/** Bottom overlay toolbar for Screen Share mode — quick-trigger visual/audio cues to keep students engaged. Purely client-side (Web Audio + canvas-confetti), no network calls, so it fires instantly. */
export default function GamificationBar() {
  // 1-4 trigger the 4 actions left-to-right, matching their on-screen order
  // — this component is only ever mounted while presenting (see
  // TeachingView), so there's no risk of these keys firing outside Screen
  // Share mode or stealing digits from an input elsewhere in the app.
  //
  // Registered with capture:true and specifically on `window` (not
  // `document`) so it runs before Excalidraw's own keydown handler, which
  // *also* treats bare "1"-"4" as tool-switch shortcuts (Selection/
  // Rectangle/Diamond/Ellipse) and deliberately listens on `document` with
  // capture:true itself to preempt "handlers bound before it" — window's
  // capture phase always fires before document's, so this wins that race
  // and stopPropagation() below keeps Excalidraw from ever seeing the key
  // and swapping the active tool out from under the teacher.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // Exact string match against a fixed allow-list, not Number(e.key) —
      // that coercion turns every non-digit key (letters, Tab, Escape,
      // modifiers, ...) into NaN, and `NaN < 0` / `NaN >= length` are both
      // false, so an arithmetic bounds check silently lets NaN through and
      // ACTIONS[NaN] blows up on `.run` for literally any non-digit key.
      const index = ["1", "2", "3", "4"].indexOf(e.key);
      if (index === -1) return;
      e.stopPropagation();
      e.preventDefault();
      ACTIONS[index].run();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        zIndex: 10001,
        display: "flex",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 999,
        background: "rgba(58, 46, 40, 0.85)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      {ACTIONS.map((action, i) => (
        <button
          key={action.id}
          type="button"
          onClick={action.run}
          title={`${action.label} (${i + 1})`}
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            background: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: 9999,
            padding: "8px 16px",
            color: "#fff",
            cursor: "pointer",
            fontSize: 22,
            lineHeight: 1,
            transition: "transform 0.15s ease, background 0.15s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <span
            style={{
              position: "absolute",
              top: -4,
              right: 2,
              fontSize: 10,
              fontWeight: 700,
              width: 15,
              height: 15,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {i + 1}
          </span>
          <span>{action.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
