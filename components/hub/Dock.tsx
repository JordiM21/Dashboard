"use client";

/** Player Dock (§3): level + XP, streak week, done-today feed, achievements, companion. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SidebarSimple, Snowflake } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { ACHIEVEMENTS, levelFromXp, streak, totalXp, isFocus } from "@/lib/hub/game";
import { onFx } from "@/lib/hub/fx";
import * as A from "@/lib/hub/actions";
import { hhmm, today } from "@/lib/hub/util";
import { Badge, Flame, LevelRing, StreakDots } from "./game";
import { Pip, spring } from "./ui";
import { coverCss } from "./Customize";

export function usePlayer() {
  const s = useHub();
  return useMemo(() => {
    const total = totalXp(s.game.xp);
    return { total, ...levelFromXp(total), streak: streak(s) };
  }, [s]);
}

export default function Dock({ rail }: { rail: boolean }) {
  const s = useHub();
  const p = usePlayer();
  const [glow, setGlow] = useState(false);
  const [banner, setBanner] = useState<number | null>(null);
  const [mood, setMood] = useState<"happy" | "hyped" | null>(null);

  useEffect(
    () =>
      onFx((e) => {
        if (e.type === "xp") {
          setTimeout(() => setGlow(true), 480);
          setTimeout(() => setGlow(false), 1700);
          setMood((m) => m ?? "happy");
          setTimeout(() => setMood((m) => (m === "happy" ? null : m)), 2400);
        }
        if (e.type === "levelup") {
          setBanner(e.level);
          setMood("hyped");
          setTimeout(() => setBanner(null), 4200);
          setTimeout(() => setMood(null), 4200);
        }
      }),
    []
  );

  const t = today();
  const doneToday = s.game.xp.filter((e) => e.at.slice(0, 10) === t).slice(-6).reverse();
  const unlocked = ACHIEVEMENTS.filter((a) => s.game.unlocked[a.id]).sort((a, b) => (s.game.unlocked[b.id] > s.game.unlocked[a.id] ? 1 : -1));
  const questsLeft = s.tasks.filter((x) => isFocus(x, t)).length;
  const companion = mood ?? (p.streak.atRisk ? "sleepy" : "idle");
  const status = p.streak.atRisk
    ? `Streak at risk — ${Math.max(0, 3 - s.tasks.filter((x) => x.completedAt?.slice(0, 10) === t && isFocus({ ...x, status: "next" }, t)).length)} focus tasks to save it`
    : questsLeft === 0
      ? "All quests clear. Go touch grass."
      : `${questsLeft} quest${questsLeft === 1 ? "" : "s"} left${p.streak.todayCounted ? ", streak safe" : ""}`;

  if (rail) {
    return (
      <div className="dock" style={{ gap: 18 }}>
        <Link href="/character" title={`Level ${p.level}`}>
          <LevelRing pct={p.pct} level={p.level} size={48} stroke={4} glow={glow} />
        </Link>
        <div className="col" style={{ alignItems: "center", gap: 0 }} title={`${p.streak.current}-day streak`}>
          <Flame size={22} live={p.streak.current >= 3} />
          <span className="headline" style={{ color: "var(--ember)" }}>
            {p.streak.current}
          </span>
        </div>
        <span id="dock-xp" style={{ width: 1, height: 1 }} />
        <span className="spacer" />
        <button className="icon-btn" title="Expand dock (Ctrl .)" aria-label="Expand dock" onClick={() => A.setSettings({ dock: "open" })}>
          <SidebarSimple size={18} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>
    );
  }

  return (
    <div className="dock">
      <div className="row" style={{ gap: 14 }}>
        <Link href="/character" aria-label="Character sheet">
          <LevelRing pct={p.pct} level={p.level} size={72} glow={glow} />
        </Link>
        <div className="grow col" style={{ gap: 6 }}>
          <div className="row">
            {s.settings.avatar && <span className="avatar" style={{ width: 22, height: 22, background: coverCss(s.settings.avatar) }} />}
            <span className="headline">{s.settings.ownerName}</span>
            <span className="spacer" />
            <button className="icon-btn" title="Collapse dock (Ctrl .)" aria-label="Collapse dock" onClick={() => A.setSettings({ dock: "rail" })} style={{ width: 26, height: 26 }}>
              <SidebarSimple size={16} style={{ transform: "scaleX(-1)" }} />
            </button>
          </div>
          <div id="dock-xp" className="progress xp" style={glow ? { boxShadow: "0 0 24px var(--glow)" } : undefined}>
            <i style={{ width: `${Math.round(p.pct * 100)}%` }} />
          </div>
          <span className="caption muted">
            {p.into.toLocaleString()} / {p.need.toLocaleString()} XP
          </span>
        </div>
      </div>

      <AnimatePresence>
        {banner && (
          <motion.div className="banner-level" initial={{ y: -20, opacity: 0, height: 0 }} animate={{ y: 0, opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.reward}>
            <span className="display-m">Level {banner}</span>
            <span className="caption">Unlocked. Keep going.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="card" style={{ padding: 16 }} aria-label="Streak">
        <div className="row" style={{ marginBottom: 12 }}>
          <Flame live={p.streak.current >= 3} />
          <span className="streak-num">{p.streak.current}</span>
          <span className="callout muted">day streak</span>
          <span className="spacer" />
          {p.streak.atRisk ? (
            <span className="chip warning">At risk</span>
          ) : p.streak.freezes > 0 ? (
            <span className="chip" title="Streak freezes banked">
              <Snowflake size={12} /> {p.streak.freezes}
            </span>
          ) : null}
        </div>
        <StreakDots week={p.streak.week} />
        <p className="caption muted" style={{ margin: "10px 0 0" }}>
          Plan the day and finish 3 focus tasks. Best: {p.streak.longest}
        </p>
      </section>

      <section aria-label="Done today">
        <div className="label" style={{ marginBottom: 8 }}>
          Done today
        </div>
        {doneToday.length === 0 ? (
          <p className="callout faint" style={{ margin: 0 }}>
            Nothing yet. Your first win shows up here.
          </p>
        ) : (
          <div className="col" style={{ gap: 2 }}>
            <AnimatePresence initial={false}>
              {doneToday.map((e) => (
                <motion.div key={e.id} className="row callout" style={{ minHeight: 28 }} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={spring.ui}>
                  <span className="truncate grow">{e.label}</span>
                  <span className="faint caption">{hhmm(new Date(e.at))}</span>
                  <span className="xp-chip" style={{ height: 18, fontSize: 11 }}>
                    +{e.amount}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section aria-label="Achievements">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label">Achievements</span>
          <span className="spacer" />
          <Link href="/character" className="caption muted">
            {unlocked.length}/{ACHIEVEMENTS.length}
          </Link>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {unlocked.slice(0, 4).map((a) => (
            <span key={a.id} title={`${a.name} · ${a.unlock}`}>
              <Badge rarity={a.rarity} size={40} glyph={a.name[0]} />
            </span>
          ))}
          {unlocked.length === 0 && <span className="callout faint">First Blood is one task away.</span>}
        </div>
      </section>

      <section className="card companion" style={{ padding: 14, marginTop: "auto" }} aria-label="Companion">
        <Pip state={companion} size={56} key={companion} />
        <div className="col" style={{ gap: 2 }}>
          <span className="headline">Pip</span>
          <span className="callout muted">{status}</span>
        </div>
      </section>
    </div>
  );
}
