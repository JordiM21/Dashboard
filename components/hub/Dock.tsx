"use client";

/** Player Dock (§3): level + XP, done-today feed, up-next list, achievements, companion. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SidebarSimple } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { ACHIEVEMENTS, levelFromXp, totalXp, isFocus } from "@/lib/hub/game";
import { onFx } from "@/lib/hub/fx";
import * as A from "@/lib/hub/actions";
import { addDays, dayOf, hhmm, relDay, today } from "@/lib/hub/util";
import type { Task } from "@/lib/hub/types";
import { pipLine } from "@/lib/hub/pip";
import { Badge, LevelRing } from "./game";
import { Pip, spring } from "./ui";
import { coverCss } from "./Customize";
import { useShell } from "./Shell";
import { taskColor } from "./TaskRow";

export function usePlayer() {
  const s = useHub();
  return useMemo(() => {
    const total = totalXp(s.game.xp);
    return { total, ...levelFromXp(total) };
  }, [s.game.xp]);
}

/** Everything still open, in the order it's coming up: today (incl. overdue), tomorrow, the next 7 days, then the undated pile. */
function UpNext() {
  const s = useHub();
  const { inspect } = useShell();
  const t = today();
  const groups = useMemo(() => {
    const out: { key: string; label: string; tone: string; tasks: (Task & { when?: string })[] }[] = [
      { key: "today", label: "Today", tone: "var(--accent)", tasks: [] },
      { key: "tmr", label: "Tomorrow", tone: "var(--text-1)", tasks: [] },
      { key: "week", label: "Next 7 days", tone: "var(--text-2)", tasks: [] },
      { key: "inbox", label: "Inbox & unscheduled", tone: "var(--warning-ink)", tasks: [] },
    ];
    const tmr = addDays(t, 1);
    const wk = addDays(t, 7);
    for (const x of s.tasks) {
      if (x.archivedAt || x.status === "done" || x.status === "dropped") continue;
      const when = [x.scheduled, x.due].filter((d): d is string => !!d).sort()[0];
      const g = x.status === "inbox" || !when ? 3 : when <= t ? 0 : when === tmr ? 1 : when <= wk ? 2 : -1;
      if (g >= 0) out[g].tasks.push({ ...x, when });
    }
    for (const g of out) g.tasks.sort((a, b) => (a.when ?? "9").localeCompare(b.when ?? "9") || a.priority - b.priority);
    return out.filter((g) => g.tasks.length);
  }, [s.tasks, t]);

  return (
    <section className="card up-next" aria-label="Up next">
      <div className="label" style={{ marginBottom: 4 }}>
        Up next
      </div>
      {groups.length === 0 && <p className="callout faint" style={{ margin: 0 }}>Nothing planned. Enjoy it.</p>}
      {groups.map((g) => (
        <div key={g.key} className="col" style={{ gap: 2 }}>
          <div className="row caption up-next-head" style={{ color: g.tone }}>
            <b>{g.label}</b>
            <span className="faint">{g.tasks.length}</span>
          </div>
          {g.tasks.map((x) => (
            <button key={x.id} className="up-next-row callout" style={{ "--tc": taskColor(s, x) } as CSSProperties} onClick={() => inspect({ kind: "task", id: x.id })}>
              <span className="truncate grow">{x.title}</span>
              {g.key === "week" || (g.key === "today" && x.when! < t) ? (
                <span className="caption" style={{ color: x.when! < t ? "var(--danger-ink)" : "var(--text-3)" }}>
                  {relDay(x.when)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </section>
  );
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
  const doneToday = s.game.xp.filter((e) => dayOf(e.at) === t).slice(-6).reverse();
  const unlocked = ACHIEVEMENTS.filter((a) => s.game.unlocked[a.id]).sort((a, b) => (s.game.unlocked[b.id] > s.game.unlocked[a.id] ? 1 : -1));
  const questsLeft = s.tasks.filter((x) => isFocus(x, t)).length;
  const companion = mood ?? "idle";
  const status = questsLeft === 0 ? "All quests clear. Go touch grass." : `${questsLeft} quest${questsLeft === 1 ? "" : "s"} left`;

  if (rail) {
    return (
      <div className="dock" style={{ gap: 18 }}>
        <Link href="/character" title={`Level ${p.level}`}>
          <LevelRing pct={p.pct} level={p.level} size={48} stroke={4} glow={glow} />
        </Link>
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

      <section className="card" style={{ padding: 14 }} aria-label="Done today">
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

      <UpNext />

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
          <span className="callout">{pipLine()}</span>
          <span className="caption faint">{status}</span>
        </div>
      </section>
    </div>
  );
}
