"use client";

/** Compact sheets over the canvas: lesson log (30-second form), Plan my day, Settings. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useHub, resetStore, storeMode } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { classesOn, members } from "@/lib/hub/metrics";
import { isFocus, XP } from "@/lib/hub/game";
import { demoSeed } from "@/lib/hub/seed";
import { relDay, today } from "@/lib/hub/util";
import { Avatar, Segmented, Sheet, AreaDot } from "./ui";
import { useArea } from "./Shell";

export function LessonLogSheet({ groupId, onClose }: { groupId: string | null | undefined; onClose: () => void }) {
  const live = useLive();
  const s = useHub();
  const [gid, setGid] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [att, setAtt] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const open = groupId !== undefined;

  useEffect(() => {
    if (!open) return;
    const fallback = classesOn(today(), live, s).at(-1)?.group.id ?? live.groups[0]?.id ?? "";
    setGid(groupId || fallback);
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId]);

  const group = live.groups.find((g) => g.id === gid);
  const roster = group ? members(group, live.students) : [];
  const level = live.curriculum.find((l) => l.levelNumber === group?.currentLevel);
  useEffect(() => {
    setTopic(group?.currentTopic ?? "");
    setAtt(Object.fromEntries(roster.map((r) => [r.id, true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid]);

  return (
    <Sheet open={open} onClose={onClose} label="Log lesson">
      <div className="row">
        <h2 className="title">Log lesson</h2>
        <span className="spacer" />
        <span className="xp-chip" style={{ background: "transparent", border: "1px solid var(--line-strong)", color: "var(--text-2)" }}>
          +{XP.lesson} XP
        </span>
      </div>
      <Segmented label="Group" value={gid} onChange={setGid} options={live.groups.map((g) => ({ value: g.id, label: g.name }))} />
      <label className="field">
        <span>Topic covered · Level {group?.currentLevel} {level ? `· ${level.title}` : ""}</span>
        <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
          {[...(level?.subtopics ?? []), ...(group && !level?.subtopics.includes(group.currentTopic) ? [group.currentTopic] : [])].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Attendance · tap to toggle</span>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {roster.length === 0 && <span className="callout faint">No students in this group.</span>}
          {roster.map((r) => (
            <button
              key={r.id}
              className="chip"
              aria-pressed={att[r.id]}
              onClick={() => setAtt((a) => ({ ...a, [r.id]: !a[r.id] }))}
              style={{ height: 36, paddingLeft: 4, paddingRight: 12, gap: 8, ...(att[r.id] ? { borderColor: "var(--accent)", color: "var(--text-1)", background: "var(--accent-soft)" } : { opacity: 0.6, textDecoration: "line-through" }) }}
            >
              <Avatar name={r.name} src={r.photoUrl} />
              {r.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What landed, what to review…" style={{ minHeight: 70 }} />
      </label>
      <div className="row">
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!gid}
          onClick={() => {
            A.logLesson({ date: today(), groupId: gid, topic, attendance: att, notes, archivedAt: null });
            onClose();
          }}
        >
          Save log
        </button>
      </div>
    </Sheet>
  );
}

export function PlanDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useHub();
  const { match } = useArea();
  const t0 = today();
  const [picked, setPicked] = useState<string[]>([]);
  const [over, setOver] = useState<"pool" | "today" | null>(null);
  useEffect(() => {
    if (open) setPicked(s.tasks.filter((t) => isFocus(t, t0)).sort((a, b) => a.priority - b.priority).map((t) => t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pool = useMemo(() => s.tasks.filter((t) => !t.archivedAt && (t.status === "inbox" || t.status === "next" || t.status === "doing") && !picked.includes(t.id) && match(t.areaId)).sort((a, b) => a.priority - b.priority), [s.tasks, picked, match]);
  const chosen = picked.map((id) => s.tasks.find((t) => t.id === id)).filter(Boolean) as typeof s.tasks;
  const est = chosen.reduce((a, t) => a + (t.estimate ?? 0), 0);
  const area = (id: string) => s.areas.find((a) => a.id === id);

  const Row = ({ t, side }: { t: (typeof s.tasks)[number]; side: "pool" | "today" }) => (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
      className="ev-card row"
      style={{ "--c": area(t.areaId)?.color, cursor: "grab" } as CSSProperties}
      onClick={() => setPicked((p) => (side === "pool" ? [...p, t.id] : p.filter((x) => x !== t.id)))}
    >
      <span className="grow truncate">{t.title}</span>
      <span className="caption faint">
        P{t.priority}
        {t.estimate ? ` · ${t.estimate}m` : ""}
        {t.status === "inbox" ? " · Inbox" : ""}
      </span>
    </button>
  );
  const drop = (side: "pool" | "today") => ({
    onDragOver: (e: React.DragEvent) => (e.preventDefault(), setOver(side)),
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData("text/plain");
      setOver(null);
      setPicked((p) => (side === "today" ? (p.includes(id) ? p : [...p, id]) : p.filter((x) => x !== id)));
    },
  });

  return (
    <Sheet open={open} onClose={onClose} wide label="Plan my day">
      <div className="row">
        <div className="col" style={{ gap: 2 }}>
          <h2 className="title">Plan my day</h2>
          <span className="callout muted">Drag or click tasks into today. Keep it to 7. Planned before 11:00 earns +{XP.plan} XP.</span>
        </div>
      </div>
      <div className="bento" style={{ gap: 12 }}>
        <div className="span-6 col">
          <span className="label">Inbox & Next</span>
          <div className="week-col" data-over={over === "pool"} style={{ minHeight: 360, maxHeight: 420, overflow: "auto", background: "var(--bg-raised)" }} {...drop("pool")}>
            {pool.map((t) => (
              <Row key={t.id} t={t} side="pool" />
            ))}
            {pool.length === 0 && <span className="callout faint">Nothing left to pull in.</span>}
          </div>
        </div>
        <div className="span-6 col">
          <div className="row">
            <span className="label">Today · {chosen.length}/7</span>
            <span className="spacer" />
            <span className="caption muted">{Math.round(est / 6) / 10}h estimated</span>
          </div>
          <div className="week-col" data-over={over === "today"} style={{ minHeight: 360, maxHeight: 420, overflow: "auto", background: "var(--bg-raised)", outline: chosen.length > 7 ? "2px solid var(--warning)" : undefined }} {...drop("today")}>
            {chosen.map((t) => (
              <Row key={t.id} t={t} side="today" />
            ))}
            {chosen.length === 0 && <span className="callout faint">Drop tasks here.</span>}
          </div>
        </div>
      </div>
      <div className="row">
        {chosen.length > 7 && <span className="callout" style={{ color: "var(--warning-ink)" }}>More than 7 — Today will show the top 7.</span>}
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            A.planDay(picked);
            onClose();
          }}
        >
          Set today’s focus
        </button>
      </div>
    </Sheet>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useHub();
  const { user } = useAuth();
  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <h2 className="title">Settings</h2>
      <div className="prop-grid" style={{ gridTemplateColumns: "140px 1fr", rowGap: 14 }}>
        <span>Theme</span>
        <Segmented label="Theme" size="sm" value={s.settings.theme} onChange={(v) => A.setSettings({ theme: v })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        <span>Game layer</span>
        <Segmented label="Game layer" size="sm" value={s.settings.game} onChange={(v) => A.setSettings({ game: v })} options={[{ value: "full", label: "Full" }, { value: "subtle", label: "Subtle" }, { value: "off", label: "Off" }]} />
        <span>Rest day</span>
        <select className="select" value={s.settings.restDay} onChange={(e) => A.setSettings({ restDay: Number(e.target.value) })}>
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <span>Your name</span>
        <input className="input" value={s.settings.ownerName} onChange={(e) => A.setSettings({ ownerName: e.target.value })} />
        <span>Areas</span>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {s.areas.map((a) => (
            <span key={a.id} className="chip">
              <AreaDot area={a} /> {a.name}
            </span>
          ))}
        </div>
      </div>
      <p className="caption muted" style={{ margin: 0 }}>
        Subtle drops confetti and bursts. Off hides the Dock and every reward — the app still works the same.
      </p>
      <hr className="divider" />
      <div className="row">
        <span className="callout muted grow">
          {storeMode() === "demo" ? "You’re looking at demo data. Nothing here touches the live app." : `Signed in as ${user?.email}. v2 records are stored on this device until deploy.`}
        </span>
        {storeMode() === "demo" && (
          <button className="btn btn-sm" onClick={() => (resetStore(demoSeed), onClose())}>
            Reset demo
          </button>
        )}
        {user && (
          <button className="btn btn-sm" onClick={() => signOut(auth)}>
            Sign out
          </button>
        )}
      </div>
      <p className="caption faint" style={{ margin: 0 }}>
        Shortcuts: Ctrl K search · N quick add · Ctrl 1–9 modules · Ctrl \ sidebar · Ctrl . dock · Esc close · {relDay(today())}
      </p>
    </Sheet>
  );
}
