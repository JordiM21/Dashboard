"use client";

/** Character sheet (§8, §10): level ring large, area stats, XP per week, achievement wall, longest streak. */
import { useMemo, type CSSProperties } from "react";
import { useHub } from "@/lib/hub/store";
import { ACHIEVEMENTS, levelFromXp, xpByArea, streak, totalXp } from "@/lib/hub/game";
import { addDays, dayOf, formatDateDMY, weekStart } from "@/lib/hub/util";
import { Toolbar } from "../Shell";
import { Badge, Flame, LevelRing } from "../game";
import { Fade, Pip } from "../ui";
import { coverCss } from "../Customize";
import { PillBars } from "./Goals";

export default function Character() {
  const s = useHub();
  const total = totalXp(s.game.xp);
  const lv = levelFromXp(total);
  const st = streak(s);
  const areaXp = xpByArea(s.game.xp);
  const weeks = useMemo(() => {
    const cur = weekStart();
    return Array.from({ length: 8 }, (_, i) => {
      const w = addDays(cur, -7 * (7 - i));
      const end = addDays(w, 7);
      return { label: formatDateDMY(w).slice(0, 5), value: s.game.xp.filter((e) => dayOf(e.at) >= w && dayOf(e.at) < end).reduce((a, e) => a + e.amount, 0) };
    });
  }, [s.game.xp]);
  const maxArea = Math.max(1, ...Object.values(areaXp));

  return (
    <>
      <Toolbar areas={false} title="Character" />
      <Fade className="canvas">
        <div className="bento">
          <section className="card span-5 col" style={{ alignItems: "center", gap: 16, padding: 32 }}>
            <LevelRing pct={lv.pct} level={lv.level} size={200} stroke={12}>
              <div className="col" style={{ alignItems: "center", gap: 0 }}>
                {s.settings.avatar ? <span className="avatar" style={{ width: 84, height: 84, background: coverCss(s.settings.avatar) }} /> : <Pip state={st.atRisk ? "sleepy" : "idle"} size={84} />}
                <span className="label">Level</span>
                <span className="display-xl">{lv.level}</span>
              </div>
            </LevelRing>
            <h1 className="title">{s.settings.ownerName}</h1>
            <span className="callout muted">
              {total.toLocaleString()} XP total · {(lv.need - lv.into).toLocaleString()} XP to level {lv.level + 1}
            </span>
            <div className="row" style={{ gap: 24 }}>
              <div className="col" style={{ alignItems: "center", gap: 0 }}>
                <span className="row">
                  <Flame live={st.current >= 3} />
                  <span className="streak-num">{st.current}</span>
                </span>
                <span className="caption muted">current streak</span>
              </div>
              <div className="col" style={{ alignItems: "center", gap: 0 }}>
                <span className="streak-num" style={{ color: "var(--gold)" }}>
                  {st.longest}
                </span>
                <span className="caption muted">longest streak</span>
              </div>
            </div>
          </section>
          <section className="card span-7">
            <div className="card-head">
              <span className="headline">Area stats</span>
            </div>
            <div className="col" style={{ gap: 14 }}>
              {s.areas.map((a) => {
                const x = areaXp[a.id] ?? 0;
                const l = levelFromXp(x);
                return (
                  <div key={a.id} className="row">
                    <span className="callout" style={{ width: 110 }}>
                      {a.name}
                    </span>
                    <span className="lvl-chip" style={{ marginLeft: 0, width: 50, textAlign: "center" }}>
                      Lv {l.level}
                    </span>
                    <div className="grow progress" style={{ height: 10 }}>
                      <i style={{ width: `${(x / maxArea) * 100}%`, background: a.color } as CSSProperties} />
                    </div>
                    <span className="caption muted" style={{ width: 70, textAlign: "right" }}>
                      {x.toLocaleString()} XP
                    </span>
                  </div>
                );
              })}
            </div>
            <hr className="divider" style={{ margin: "20px 0 8px" }} />
            <div className="headline">XP per week</div>
            <PillBars data={weeks} fmt={(n) => `${n} XP`} kind="xp" />
          </section>
          <section className="card span-12">
            <div className="card-head">
              <span className="headline">Achievements</span>
              <span className="caption muted">
                {ACHIEVEMENTS.filter((a) => s.game.unlocked[a.id]).length}/{ACHIEVEMENTS.length}
              </span>
            </div>
            <div className="grid-cards" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", paddingTop: 0 }}>
              {ACHIEVEMENTS.map((a) => {
                const at = s.game.unlocked[a.id];
                const prog = a.id === "zero-inbox" ? s.game.inboxZeroDays.length : a.id === "iron-streak" ? st.longest : null;
                return (
                  <div key={a.id} className="tile row" style={{ gap: 14 }}>
                    <Badge rarity={a.rarity} locked={!at} size={52} glyph={a.name[0]} />
                    <div className="col" style={{ gap: 2, minWidth: 0 }}>
                      <span className="headline">{a.name}</span>
                      <span className="caption muted">{a.unlock}</span>
                      <span className="caption" style={{ color: at ? "var(--success-ink)" : "var(--text-3)" }}>
                        {at ? `Unlocked ${formatDateDMY(at)}` : prog != null ? `${Math.min(prog, a.goal)}/${a.goal}` : a.rarity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </Fade>
    </>
  );
}
