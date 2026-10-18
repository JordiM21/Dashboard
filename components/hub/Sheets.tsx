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
import { CaretDown, CaretUp, Plus } from "@phosphor-icons/react";
import { bindings, comboOf, KEY_ACTIONS, prettyCombo } from "@/lib/hub/keys";
import { sfx } from "@/lib/hub/sound";
import { toast } from "@/lib/hub/fx";
import { CoverPicker, IconPicker, SWATCHES, coverCss } from "./Customize";
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
  const [tab, setTab] = useState<"general" | "areas" | "keys" | "sound">("general");
  return (
    <Sheet open={open} onClose={onClose} wide label="Settings">
      <div className="row">
        <h2 className="title grow">Settings</h2>
        <Segmented label="Settings section" size="sm" value={tab} onChange={setTab} options={[{ value: "general", label: "General" }, { value: "areas", label: "Areas" }, { value: "keys", label: "Keys" }, { value: "sound", label: "Sound" }]} />
      </div>
      <div style={{ minHeight: 380 }}>
        {tab === "general" && (
          <div className="col" style={{ gap: 18 }}>
            <div className="row" style={{ gap: 16 }}>
              <AvatarPicker />
              <label className="field grow">
                <span>Your name</span>
                <input className="input" value={s.settings.ownerName} onChange={(e) => A.setSettings({ ownerName: e.target.value })} />
              </label>
            </div>
            <div className="prop-grid" style={{ gridTemplateColumns: "140px 1fr", rowGap: 14 }}>
              <span>Theme</span>
              <Segmented label="Theme" size="sm" value={s.settings.theme} onChange={(v) => A.setSettings({ theme: v })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
              <span>Game layer</span>
              <Segmented label="Game layer" size="sm" value={s.settings.game} onChange={(v) => A.setSettings({ game: v })} options={[{ value: "full", label: "Full" }, { value: "subtle", label: "Subtle" }, { value: "off", label: "Off" }]} />
              <span>Rest day</span>
              <select className="select" style={{ width: 200 }} value={s.settings.restDay} onChange={(e) => A.setSettings({ restDay: Number(e.target.value) })}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <p className="caption muted" style={{ margin: 0 }}>
              Subtle drops confetti and bursts. Off hides the Dock and every reward — the app still works the same.
            </p>
            <hr className="divider" />
            <div className="row">
              <span className="callout muted grow">
                {storeMode() === "demo" ? "You’re looking at demo data. Nothing here touches the live app." : `Signed in as ${user?.email}. Everything saves to your database and syncs across devices.`}
              </span>
              {storeMode() === "demo" && (
                <button className="btn btn-sm" onClick={() => (resetStore(demoSeed), onClose())}>
                  Reset demo
                </button>
              )}
              {user && (
                <button className="btn btn-sm" onClick={() => signOut(auth).then(() => location.assign("/login"))}>
                  Sign out
                </button>
              )}
            </div>
          </div>
        )}
        {tab === "areas" && <AreasEditor />}
        {tab === "keys" && <KeysEditor />}
        {tab === "sound" && (
          <div className="col" style={{ gap: 18 }}>
            <div className="prop-grid" style={{ gridTemplateColumns: "140px 1fr", rowGap: 16 }}>
              <span>Sound effects</span>
              <Segmented label="Sound" size="sm" value={s.settings.sound ? "on" : "off"} onChange={(v) => A.setSettings({ sound: v === "on" })} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
              <span>Volume</span>
              <div className="row">
                <input type="range" min={0} max={1} step={0.05} value={s.settings.volume} onChange={(e) => A.setSettings({ volume: Number(e.target.value) })} onPointerUp={() => sfx.check()} style={{ width: 240, accentColor: "var(--accent)" }} aria-label="Volume" disabled={!s.settings.sound} />
                <span className="caption muted">{Math.round(s.settings.volume * 100)}%</span>
              </div>
            </div>
            <div className="field">
              <span>Preview</span>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {(
                  [
                    ["tap", "Click"],
                    ["nav", "Navigate"],
                    ["toggle", "Toggle"],
                    ["primary", "Primary"],
                    ["check", "Complete"],
                    ["open", "Open panel"],
                    ["page", "Page change"],
                    ["step", "Keyboard step"],
                    ["xp", "XP"],
                    ["levelup", "Level up"],
                    ["achievement", "Achievement"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className="btn btn-sm" data-sound="none" onClick={() => sfx[k]()}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <p className="caption muted" style={{ margin: 0 }}>
              Every cue is synthesized on the fly, under 150 ms and mixed low. Different surfaces get different cues so the app is legible by ear.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function AvatarPicker() {
  const s = useHub();
  return (
    <div className="col" style={{ alignItems: "center", gap: 6 }}>
      <span className="avatar avatar-lg" style={{ width: 64, height: 64, background: coverCss(s.settings.avatar) ?? "var(--bg-sunken)" }}>
        {!s.settings.avatar && s.settings.ownerName.slice(0, 1)}
      </span>
      <CoverPicker compact value={s.settings.avatar} onChange={(v) => A.setSettings({ avatar: v })} height={0} />
    </div>
  );
}

function AreasEditor() {
  const s = useHub();
  const [name, setName] = useState("");
  const areas = [...s.areas].filter((a) => !a.archivedAt).sort((a, b) => a.sort - b.sort);
  return (
    <div className="col" style={{ gap: 6 }}>
      <p className="caption muted" style={{ margin: "0 0 6px" }}>
        Areas are yours to shape: rename, recolour, reorder, or hide one you’re not using. Hidden areas keep their records.
      </p>
      {areas.map((a, i) => (
        <div key={a.id} className="row tile" style={{ padding: 8, gap: 10, opacity: a.active ? 1 : 0.55 }}>
          <IconPicker icon={a.icon} color={a.color} size={34} onIcon={(icon) => A.updateArea(a.id, { icon })} onColor={(color) => A.updateArea(a.id, { color })} label={`Icon and colour for ${a.name}`} />
          <input className="input grow" value={a.name} onChange={(e) => A.updateArea(a.id, { name: e.target.value })} aria-label="Area name" />
          <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => A.moveArea(a.id, -1)}>
            <CaretUp size={16} />
          </button>
          <button className="icon-btn" aria-label="Move down" disabled={i === areas.length - 1} onClick={() => A.moveArea(a.id, 1)}>
            <CaretDown size={16} />
          </button>
          <button className="btn btn-sm" style={{ width: 70 }} aria-pressed={a.active} onClick={() => A.updateArea(a.id, { active: !a.active })}>
            {a.active ? "Hide" : "Show"}
          </button>
        </div>
      ))}
      <form
        className="row"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          A.addArea(name.trim(), SWATCHES[areas.length % SWATCHES.length]);
          setName("");
        }}
      >
        <input className="input" placeholder="New area — e.g. Fitness, Side project" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim()}>
          <Plus size={14} /> Add area
        </button>
      </form>
    </div>
  );
}

function KeysEditor() {
  const s = useHub();
  const [rec, setRec] = useState<string | null>(null);
  const keys = bindings(s.settings.keys);
  useEffect(() => {
    if (!rec) return;
    const k = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRec(null);
      const combo = comboOf(e);
      if (/^(Arrow|Enter|Tab|[0-9]$)/.test(combo) || (s.settings.navKeys === "wasd" && /^[wasd]$/.test(combo))) {
        toast("That key is reserved for navigation");
        return setRec(null);
      }
      // A combo belongs to one action: whoever had it gets their default back (or nothing if that clashes too).
      const next = { ...s.settings.keys, [rec]: combo };
      for (const a of KEY_ACTIONS) if (a.id !== rec && bindings(next)[a.id] === combo) next[a.id] = "";
      A.setSettings({ keys: next });
      sfx.toggle();
      setRec(null);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [rec, s.settings.keys, s.settings.navKeys]);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="prop-grid" style={{ gridTemplateColumns: "140px 1fr" }}>
        <span>Move selector</span>
        <Segmented label="Navigation keys" size="sm" value={s.settings.navKeys} onChange={(v) => A.setSettings({ navKeys: v })} options={[{ value: "arrows", label: "Arrow keys" }, { value: "wasd", label: "Arrows + WASD" }]} />
      </div>
      <p className="caption muted" style={{ margin: 0 }}>
        Enter clicks the selected item · 1–9 jump to sidebar modules · Esc clears. Click a shortcut below and press the new keys.
      </p>
      <div className="bento" style={{ gap: "4px 24px" }}>
        {KEY_ACTIONS.map((a) => (
          <div key={a.id} className="row span-6" style={{ minHeight: 34 }}>
            <span className="callout grow">{a.label}</span>
            <button className={`btn btn-sm ${rec === a.id ? "btn-accent" : ""}`} style={{ minWidth: 92, fontFamily: "var(--font-mono)" }} onClick={() => setRec(rec === a.id ? null : a.id)} data-sound="none">
              {rec === a.id ? "Press keys…" : keys[a.id] ? prettyCombo(keys[a.id]) : "—"}
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={() => A.setSettings({ keys: {} })}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
