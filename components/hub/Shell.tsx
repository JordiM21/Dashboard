"use client";

/**
 * The app shell (Design Guide §3): Mac sidebar · work canvas · Player Dock,
 * with the Inspector sliding over the Dock. Also owns store bootstrapping,
 * global shortcuts and the automations of Feature Spec §7.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useLive } from "@/lib/hub/live";
import { initStore, getState, setState, useHub } from "@/lib/hub/store";
import { demoSeed, liveSeed } from "@/lib/hub/seed";
import * as A from "@/lib/hub/actions";
import { fx, toast } from "@/lib/hub/fx";
import { goalProgress, members, mrr, newPaying, payingStudents, receivables } from "@/lib/hub/metrics";
import { streak } from "@/lib/hub/game";
import { monthKey, prevMonth, today } from "@/lib/hub/util";
import type { Area } from "@/lib/hub/types";
import Sidebar, { NAV } from "./Sidebar";
import Dock from "./Dock";
import Inspector from "./Inspector";
import { Palette, QuickAdd, Toasts } from "./Overlays";
import { LessonLogSheet, PlanDaySheet, SettingsSheet } from "./Sheets";
import { FxLayer } from "./Fx";
import { MenuProvider, Segmented, AreaDot } from "./ui";
import { Plus } from "@phosphor-icons/react";

export type Rec = { kind: "task" | "student" | "note" | "item" | "goal" | "project" | "tx"; id: string };

interface HubCtx {
  rec: Rec | null;
  inspect: (r: Rec | null) => void;
  palette: () => void;
  quickAdd: (initial?: string) => void;
  lessonLog: (groupId?: string) => void;
  planDay: () => void;
  settings: () => void;
}

const Ctx = createContext<HubCtx>(null as unknown as HubCtx);
export const useShell = () => useContext(Ctx);

/** Global Area filter (Feature Spec §2.1). */
export function useArea() {
  const s = useHub();
  const area = s.ui.area;
  const match = useCallback((areaId: string | null | undefined) => area === "all" || areaId === area, [area]);
  return { area, match, areas: s.areas.filter((a) => a.active && !a.archivedAt).sort((a, b) => a.sort - b.sort) };
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
};

function useWidth() {
  const [w, setW] = useState(1600);
  useEffect(() => {
    const f = () => setW(innerWidth);
    f();
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return w;
}

export default function Shell({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const live = useLive();
  const [ready, setReady] = useState(false);
  const migrated = live.oldTasks !== null && live.oldProjects !== null;

  useEffect(() => {
    if (loading) return;
    if (live.mode === "demo") {
      initStore("demo", demoSeed);
      setReady(true);
    } else if (migrated) {
      initStore("live", () => liveSeed(live.oldTasks!, live.oldProjects!));
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, live.mode, migrated]);

  if (!ready) return <BootSkeleton />;
  return <Ready>{children}</Ready>;
}

function BootSkeleton() {
  return (
    <div className="hub">
      <aside className="sidebar">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 24, margin: "6px 4px" }} />
        ))}
      </aside>
      <main className="main">
        <div className="canvas">
          <div className="skeleton" style={{ height: 44, width: 340, marginBottom: 28 }} />
          <div className="bento">
            <div className="skeleton span-8" style={{ height: 220, borderRadius: 20 }} />
            <div className="skeleton span-4" style={{ height: 220, borderRadius: 20 }} />
          </div>
        </div>
      </main>
      <aside className="right" />
    </div>
  );
}

function Ready({ children }: { children: ReactNode }) {
  const s = useHub();
  const live = useLive();
  const router = useRouter();
  const pathname = usePathname();
  const width = useWidth();
  const [rec, setRec] = useState<Rec | null>(null);
  const [pal, setPal] = useState(false);
  const [qa, setQa] = useState<string | null>(null);
  const [log, setLog] = useState<string | null | undefined>(undefined);
  const [plan, setPlan] = useState(false);
  const [settings, setSettings] = useState(false);

  const sb = s.settings.sidebar === "auto" ? (width < 1280 ? "rail" : "open") : s.settings.sidebar;
  const dock = s.settings.dock === "auto" ? (width < 1440 ? "rail" : "open") : s.settings.dock;

  // theme
  useEffect(() => {
    const apply = () => {
      const t = s.settings.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : s.settings.theme;
      document.documentElement.setAttribute("data-theme", t);
      try {
        localStorage.setItem("theme", t);
      } catch {}
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s.settings.theme]);

  // close the inspector on navigation
  useEffect(() => setRec(null), [pathname]);

  const ctx = useMemo<HubCtx>(
    () => ({
      rec,
      inspect: setRec,
      palette: () => setPal(true),
      quickAdd: (initial = "") => setQa(initial),
      lessonLog: (g) => setLog(g ?? null),
      planDay: () => setPlan(true),
      settings: () => setSettings(true),
    }),
    [rec]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPal((v) => !v);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        A.setSettings({ sidebar: sb === "rail" ? "open" : "rail" });
      } else if (mod && e.key === ".") {
        e.preventDefault();
        A.setSettings({ dock: dock === "rail" ? "open" : "rail" });
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        router.push(NAV[Number(e.key) - 1].href);
      } else if (e.key === "Escape" && rec && !pal && qa === null) {
        setRec(null);
      } else if (!mod && !e.altKey && !isTyping(e) && (e.key === "n" || e.key === "q")) {
        e.preventDefault();
        setQa("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sb, dock, rec, pal, qa, router]);

  useAutomations();

  return (
    <MotionConfig reducedMotion={s.settings.game === "off" ? "always" : "user"}>
      <Ctx.Provider value={ctx}>
        <MenuProvider>
          <div className="hub" data-sb={sb} data-dock={dock} data-inspector={rec ? "open" : "closed"}>
            <Sidebar rail={sb === "rail"} />
            <main className="main" id="main">
              {children}
            </main>
            <aside className="right">
              {s.settings.game !== "off" ? <Dock rail={dock === "rail" && !rec} /> : <div className="dock" />}
              <AnimatePresence>{rec && <Inspector key={rec.kind + rec.id} rec={rec} onClose={() => setRec(null)} />}</AnimatePresence>
            </aside>
          </div>
          <Palette open={pal} onClose={() => setPal(false)} />
          <QuickAdd value={qa} onClose={() => setQa(null)} />
          <LessonLogSheet groupId={log} onClose={() => setLog(undefined)} />
          <PlanDaySheet open={plan} onClose={() => setPlan(false)} />
          <SettingsSheet open={settings} onClose={() => setSettings(false)} />
          <Toasts />
          {s.settings.game !== "off" && <FxLayer />}
          <div id="hub-live" className="sr-only" aria-live="polite" />
        </MenuProvider>
      </Ctx.Provider>
    </MotionConfig>
  );
}

/** Toolbar (§3): page title, Area filter pills, optional view switch, "+ New". */
export function Toolbar({ title, children }: { title: string; children?: ReactNode }) {
  const { area, areas } = useArea();
  const { quickAdd } = useShell();
  return (
    <header className="toolbar">
      <span className="toolbar-title">{title}</span>
      <AreaFilter area={area} areas={areas} />
      <span className="spacer" />
      {children}
      <button className="btn-primary btn" onClick={() => quickAdd("")} title="New (N)">
        <Plus size={16} weight="bold" /> New
      </button>
    </header>
  );
}

function AreaFilter({ area, areas }: { area: string; areas: Area[] }) {
  return (
    <Segmented
      label="Area filter"
      size="sm"
      value={area}
      onChange={(v) => A.setUi({ area: v })}
      options={[
        { value: "all", label: "All" },
        ...areas.map((a) => ({
          value: a.id,
          label: (
            <span className="row" style={{ gap: 6, minWidth: 8 }} title={a.name} aria-label={a.name}>
              <AreaDot area={a} />
              {area === a.id && <span>{a.name}</span>}
            </span>
          ),
        })),
      ]}
    />
  );
}

/* ---------------------------------------------------------------- automations */

function useAutomations() {
  const s = useHub();
  const live = useLive();
  const lastMrr = useRef<number | null>(null);

  useEffect(() => {
    if (!live.ready) return;
    const st = getState();
    const paying = payingStudents(live, st);
    const month = monthKey();

    // Seed the "already rewarded" set once so history never pays out retroactively.
    if (A.markAutomation("seen-init")) {
      A.markAutomation(`feedback:${month}`);
      st.game.seenActive.length === 0 && setSeen(paying.map((p) => p.id));
      return;
    }

    // New paying student → +500 XP and the onboarding template.
    for (const p of paying) {
      if (getState().game.seenActive.includes(p.id)) continue;
      setSeen([...getState().game.seenActive, p.id]);
      A.award(500, `New paying student · ${p.name}`, "student", "let", "student:" + p.id);
      const n = A.applyTemplate("tpl-onboard", { studentId: p.id });
      if (n) toast(`Onboarding: ${n} tasks created for ${p.name}`);
    }

    // Parent feedback task per active student on the 1st.
    if (A.markAutomation(`feedback:${month}`)) {
      const lastMonth = prevMonth(month);
      for (const p of paying) {
        const g = live.groups.find((x) => x.name.trim().toLowerCase() === (p.classGroup ?? "").trim().toLowerCase());
        const logs = getState().lessons.filter((l) => l.groupId === g?.id && l.date.startsWith(lastMonth));
        const att = logs.length ? Math.round((logs.filter((l) => l.attendance[p.id]).length / logs.length) * 100) : null;
        A.addTask({
          title: `Monthly feedback · ${p.name}`,
          areaId: "let",
          priority: 2,
          estimate: 10,
          due: `${month}-07`,
          studentId: p.id,
          notes: `Attendance last month: ${att == null ? "no logs" : att + "%"}\nTopics: ${logs.map((l) => l.topic).join(", ") || "—"}`,
        });
      }
    }

    // Overdue payment → follow-up task.
    for (const r of receivables(live, st)) {
      if (r.status !== "late") continue;
      if (A.markAutomation(`follow:${r.student.id}:${r.student.nextPayment}`)) {
        A.addTask({ title: `Follow up with ${r.student.name}'s parent`, areaId: "let", priority: 1, due: today(), studentId: r.student.id, notes: `Payment ${r.days} days overdue.` });
      }
    }

    // Recurring local expenses → this month's entry.
    for (const e of st.expenses) {
      if (!e.recurring || e.archivedAt || e.date.startsWith(month)) continue;
      if (st.expenses.some((x) => x.description === e.description && x.date.startsWith(month))) continue;
      if (A.markAutomation(`rexp:${e.description}:${month}`)) A.addExpense({ ...e, date: `${month}-01`, archivedAt: null });
    }
  }, [live, s.lessons.length]);

  // Achievements and bosses
  useEffect(() => {
    if (!live.ready) return;
    const st = s;
    if (live.groups.some((g) => members(g, live.students).length >= (st.groupMeta[g.id]?.capacity ?? 4))) A.unlock("full-house");
    if (st.game.inboxZeroDays.length >= 10) A.unlock("zero-inbox");
    if (streak(st).longest >= 30) A.unlock("iron-streak");
    if (newPaying(live, st, monthKey()).length >= 5) A.unlock("recruiter");
    const months = st.monthly.map((m) => m.month);
    if (months.some((m) => months.includes(prevMonth(m)) && months.includes(prevMonth(m, 2)))) A.unlock("bookkeeper");
    for (const g of st.goals) {
      if (g.archivedAt || g.horizon === "someday") continue;
      if (goalProgress(g, st, live).defeated && A.markAutomation(`boss:${g.id}`)) {
        A.unlock("boss-slayer");
        if (st.settings.game === "full") fx({ type: "boss-defeated", goalId: g.id });
      }
    }
    const m = mrr(live, st);
    if (lastMrr.current !== null && m > lastMrr.current) fx({ type: "boss-damage", amount: m - lastMrr.current });
    lastMrr.current = m;
  }, [s, live]);
}

function setSeen(ids: string[]) {
  setState((st) => ({ ...st, game: { ...st.game, seenActive: ids } }));
}

