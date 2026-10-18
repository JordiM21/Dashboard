"use client";

/** Time (§5.10): one timer at a time; classes auto-log from the schedule; LET Junior split into Delivery vs Growth. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Play, Stop, CaretLeft, CaretRight, Plus, Archive } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { classesOn } from "@/lib/hub/metrics";
import { addDays, localIso, dayName, formatDateDMY, hhmm, minutesLabel, today, weekStart } from "@/lib/hub/util";
import { Toolbar } from "../Shell";
import { Fade, Segmented, AreaDot, Empty } from "../ui";

interface Row {
  id: string;
  date: string;
  start: Date;
  minutes: number;
  label: string;
  areaId: string;
  track?: "delivery" | "growth";
  source: string;
  local: boolean;
}

export default function Time() {
  const s = useHub();
  const live = useLive();
  const running = A.runningTimer(s);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const [ws, setWs] = useState(() => weekStart());
  const [label, setLabel] = useState("");
  const [areaId, setAreaId] = useState("let");
  const [track, setTrack] = useState<"delivery" | "growth">("growth");

  const rows = useMemo<Row[]>(() => {
    const end = addDays(ws, 7);
    const out: Row[] = s.time
      .filter((e) => !e.archivedAt && e.end && e.start.slice(0, 10) >= ws && e.start.slice(0, 10) < end)
      .map((e) => ({ id: e.id, date: e.start.slice(0, 10), start: new Date(e.start), minutes: Math.round((Date.parse(e.end!) - Date.parse(e.start)) / 60000), label: e.label, areaId: e.areaId, track: e.track, source: e.source, local: true }));
    // Classes auto-log from the schedule, no manual entry (§5.10).
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      if (d > today()) break;
      for (const c of classesOn(d, live, s)) {
        if (d === today() && c.endMin > nowMin) continue;
        out.push({ id: `cls-${c.group.id}-${d}-${c.startMin}`, date: d, start: new Date(`${d}T${c.slot.start}:00`), minutes: c.slot.minutes, label: `Class · ${c.group.name}`, areaId: "let", track: "delivery", source: "calendar", local: false });
      }
    }
    return out.sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [s, live, ws]);

  const byArea = s.areas.map((a) => ({ a, m: rows.filter((r) => r.areaId === a.id).reduce((x, r) => x + r.minutes, 0) }));
  const max = Math.max(1, ...byArea.map((x) => x.m));
  const letRows = rows.filter((r) => r.areaId === "let");
  const delivery = letRows.filter((r) => r.track !== "growth").reduce((x, r) => x + r.minutes, 0);
  const growth = letRows.filter((r) => r.track === "growth").reduce((x, r) => x + r.minutes, 0);
  const total = rows.reduce((x, r) => x + r.minutes, 0);
  const elapsed = running ? Math.floor((Date.now() - Date.parse(running.start)) / 1000) : 0;
  void tick;

  return (
    <>
      <Toolbar areas={false} title="Time" />
      <Fade className="canvas">
        <section className="card" style={{ padding: 28, marginBottom: 16 }} aria-label="Timer">
          <div className="row head-row" style={{ gap: 24, alignItems: "center" }}>
            <span className="display-xl" style={{ fontVariantNumeric: "tabular-nums", minWidth: 190, color: running ? "var(--text-1)" : "var(--text-3)" }}>
              {String(Math.floor(elapsed / 3600)).padStart(2, "0")}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
            </span>
            {running ? (
              <>
                <div className="grow col" style={{ gap: 2 }}>
                  <span className="headline">{running.label}</span>
                  <span className="callout muted row">
                    <AreaDot area={s.areas.find((a) => a.id === running.areaId)} /> {s.areas.find((a) => a.id === running.areaId)?.name}
                    {running.track ? ` · ${running.track}` : ""} · since {hhmm(new Date(running.start))}
                  </span>
                </div>
                <button className="btn btn-primary" onClick={() => A.stopTimer()}>
                  <Stop size={16} weight="fill" /> Stop
                </button>
              </>
            ) : (
              <form
                className="grow row head-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  A.startTimer({ label: label.trim() || "Focus", areaId, track: areaId === "let" ? track : undefined });
                  setLabel("");
                }}
              >
                <input className="input grow" placeholder="What are you working on?" value={label} onChange={(e) => setLabel(e.target.value)} />
                <select className="select" style={{ width: 150 }} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  {s.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {areaId === "let" && <Segmented label="Track" size="sm" value={track} onChange={setTrack} options={[{ value: "delivery", label: "Delivery" }, { value: "growth", label: "Growth" }]} />}
                <button className="btn btn-primary">
                  <Play size={16} weight="fill" /> Start
                </button>
              </form>
            )}
          </div>
        </section>

        <div className="row" style={{ marginBottom: 12 }}>
          <h2 className="title">
            Week of {formatDateDMY(ws)} · {minutesLabel(total)}
          </h2>
          <span className="spacer" />
          <button className="icon-btn" aria-label="Previous week" onClick={() => setWs(addDays(ws, -7))}>
            <CaretLeft size={16} />
          </button>
          <button className="btn btn-sm" onClick={() => setWs(weekStart())}>
            This week
          </button>
          <button className="icon-btn" aria-label="Next week" onClick={() => setWs(addDays(ws, 7))}>
            <CaretRight size={16} />
          </button>
        </div>

        <div className="bento">
          <section className="card span-6">
            <div className="card-head">
              <span className="headline">Hours by area</span>
            </div>
            <div className="col" style={{ gap: 12 }}>
              {byArea.map(({ a, m }) => (
                <div key={a.id} className="row" title={`${a.name}: ${minutesLabel(m)}`}>
                  <span className="callout" style={{ width: 110 }}>
                    {a.name}
                  </span>
                  <div className="grow progress" style={{ height: 12 }}>
                    <i style={{ width: `${(m / max) * 100}%`, background: a.color }} />
                  </div>
                  <span className="caption muted" style={{ width: 54, textAlign: "right" }}>
                    {minutesLabel(m)}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="card span-6">
            <div className="card-head">
              <span className="headline">LET Junior · in vs on the business</span>
            </div>
            <div className="row" style={{ height: 40, borderRadius: 12, overflow: "hidden", gap: 2, marginBottom: 14 }}>
              <div style={{ flex: delivery || 0.001, background: "color-mix(in srgb, var(--accent) 22%, var(--bg-sunken))", height: "100%" }} />
              <div style={{ flex: growth || 0.001, background: "var(--accent)", height: "100%" }} />
            </div>
            <div className="row">
              <div className="col grow" style={{ gap: 0 }}>
                <span className="callout muted">Delivery · classes, prep</span>
                <span className="display-m">{minutesLabel(delivery)}</span>
              </div>
              <div className="col grow" style={{ gap: 0, alignItems: "flex-end" }}>
                <span className="callout muted">Growth · ads, sales, product</span>
                <span className="display-m" style={{ color: "var(--accent)" }}>
                  {minutesLabel(growth)}
                </span>
              </div>
            </div>
            <p className="caption muted" style={{ margin: "12px 0 0" }}>
              {delivery + growth === 0 ? "No LET Junior time this week." : growth / (delivery + growth) < 0.25 ? "Mostly working in the business. Block growth time before ads scale." : "Healthy split — the business is being worked on, not only in."}
            </p>
          </section>
          <section className="card span-12" style={{ padding: 8 }}>
            <div className="row" style={{ padding: "8px 10px" }}>
              <span className="headline">Entries</span>
              <span className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => A.addTimeEntry({ start: localIso(new Date(Date.now() - 30 * 60000)), end: localIso(), areaId: "let", source: "manual", label: "Manual entry", track: "growth", archivedAt: null })}>
                <Plus size={14} /> Last 30 min
              </button>
            </div>
            {rows.length === 0 && <Empty text="Nothing tracked this week." />}
            {rows.map((r) => {
              const a = s.areas.find((x) => x.id === r.areaId);
              return (
                <div key={r.id} className="task-row" style={{ "--c": a?.color } as CSSProperties}>
                  <AreaDot area={a} />
                  <span className="caption muted" style={{ width: 110 }}>
                    {dayName(r.date)} {formatDateDMY(r.date).slice(0, 5)} · {hhmm(r.start)}
                  </span>
                  <span className="grow truncate">{r.label}</span>
                  {r.track && <span className="chip">{r.track}</span>}
                  <span className="caption faint">{r.source === "calendar" ? "from schedule" : r.source}</span>
                  <b className="callout" style={{ width: 60, textAlign: "right" }}>
                    {minutesLabel(r.minutes)}
                  </b>
                  {r.local ? (
                    <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Archive entry" onClick={() => A.archive("time", r.id, "Entry archived")}>
                      <Archive size={14} />
                    </button>
                  ) : (
                    <span style={{ width: 26 }} />
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </Fade>
    </>
  );
}
