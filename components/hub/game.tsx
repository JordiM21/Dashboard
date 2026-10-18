"use client";

/** Game-layer components (Design Guide §7 "Game layer"). Volt only appears where something was earned. */
import { useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Fire, Lightning, Skull, Crown } from "@phosphor-icons/react";
import type { Rarity } from "@/lib/hub/game";
import { onFx } from "@/lib/hub/fx";
import { spring } from "./ui";

export function LevelRing({ pct, level, size = 72, stroke = 6, glow, children }: { pct: number; level: number; size?: number; stroke?: number; glow?: boolean; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="level-ring" style={{ width: size, height: size }} data-glow={glow} aria-label={`Level ${level}, ${Math.round(pct * 100)}% to next`}>
      <svg width={size} height={size} aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.02, pct))} />
      </svg>
      {children ?? (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={level} className="level-num" style={size < 60 ? { fontSize: 18 } : undefined} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={spring.reward}>
            {level}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );
}

export function StreakDots({ week }: { week: { date: string; state: string }[] }) {
  const L = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      {week.map((d, i) => (
        <span key={d.date} className="sday" data-s={d.state} title={`${d.date} · ${d.state}`}>
          {L[i]}
        </span>
      ))}
    </div>
  );
}

export function Flame({ size = 28, live }: { size?: number; live?: boolean }) {
  return (
    <span className={`flame ${live ? "flame-live" : ""}`} style={{ display: "inline-flex" }}>
      <Fire size={size} weight="duotone" />
    </span>
  );
}

const RARITY: Record<Rarity, { fill: string; stroke: string }> = {
  common: { fill: "var(--bg-raised)", stroke: "var(--text-3)" },
  rare: { fill: "color-mix(in srgb, var(--accent) 18%, var(--bg-surface))", stroke: "var(--accent)" },
  epic: { fill: "color-mix(in srgb, var(--epic) 20%, var(--bg-surface))", stroke: "var(--epic)" },
  legendary: { fill: "color-mix(in srgb, var(--gold) 28%, var(--bg-surface))", stroke: "var(--gold)" },
};

/** Hexagon shield by rarity; locked = grey silhouette. */
export function Badge({ rarity, locked, size = 52, glyph }: { rarity: Rarity; locked?: boolean; size?: number; glyph?: string }) {
  const c = RARITY[rarity];
  return (
    <span className="badge-hex" data-locked={locked} style={{ width: size, height: size * 1.1 }}>
      <svg width={size} height={size * 1.1} viewBox="0 0 52 57" aria-hidden>
        <path d="M26 2 48 14v26c0 3-1.5 5-4 6.5L26 55 8 46.5C5.5 45 4 43 4 40V14L26 2z" fill={c.fill} stroke={c.stroke} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M26 9 42 18v19c0 2-1 3.5-3 4.6L26 48 13 41.6C11 40.5 10 39 10 37V18L26 9z" fill="none" stroke={c.stroke} strokeOpacity=".35" strokeWidth="1.5" />
      </svg>
      <span style={{ position: "absolute", color: c.stroke, display: "grid", placeItems: "center" }}>
        {rarity === "legendary" ? <Crown size={size * 0.38} weight="duotone" /> : rarity === "epic" ? <Lightning size={size * 0.38} weight="duotone" /> : <span style={{ font: `700 ${size * 0.3}px var(--font-display-stack)` }}>{glyph}</span>}
      </span>
    </span>
  );
}

export function XpChip({ amount }: { amount: number }) {
  return <span className="xp-chip">+{amount} XP</span>;
}

/** Boss HP bar: remaining gap in epic, phase markers at 25/50/75. */
export function BossHp({ pct, label }: { pct: number; label?: string }) {
  const [flash, setFlash] = useState(0);
  const [dmg, setDmg] = useState<{ id: number; amount: number } | null>(null);
  useEffect(
    () =>
      onFx((e) => {
        if (e.type !== "boss-damage") return;
        setFlash((n) => n + 1);
        setDmg({ id: Date.now(), amount: e.amount });
        setTimeout(() => setDmg(null), 900);
      }),
    []
  );
  return (
    <div style={{ position: "relative" }}>
      <div className="boss-hp" role="progressbar" aria-label={label ?? "Boss HP"} aria-valuenow={Math.round((1 - pct) * 100)}>
        <i style={{ width: `${Math.max(0, (1 - pct) * 100)}%` }} />
        {[25, 50, 75].map((p) => (
          <span key={p} className="phase" style={{ left: `${p}%` }} />
        ))}
        <AnimatePresence>{flash > 0 && <motion.span key={flash} className="boss-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} />}</AnimatePresence>
      </div>
      <AnimatePresence>
        {dmg && (
          <motion.span key={dmg.id} className="dmg" style={{ right: 8, top: -6 }} initial={{ y: 0, opacity: 1 }} animate={{ y: -28, opacity: 0 }} transition={{ duration: 0.8 }}>
            −${dmg.amount}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PhaseBanner({ pct }: { pct: number }) {
  const phase = pct >= 0.75 ? 4 : pct >= 0.5 ? 3 : pct >= 0.25 ? 2 : 1;
  return (
    <span className="chip" style={{ borderColor: "color-mix(in srgb, var(--epic) 45%, transparent)", color: "var(--epic)" } as CSSProperties}>
      <Skull size={13} weight="duotone" /> Phase {phase}
    </span>
  );
}
