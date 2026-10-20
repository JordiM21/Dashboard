"use client";

/**
 * The wired sources (Feature Spec §1 "stays"): students, Stripe-fed
 * transactions, recurring bills, groups, curriculum, lessons and the
 * resource library, read live from Firestore when signed in. Signed out
 * (local preview) the same shapes come from lib/hub/demo.ts. v2 never
 * writes to these collections — its own records live in lib/hub/store.ts.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { collection, getDocs, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/AuthContext";
import type { CurriculumLevelDoc, FinanceEntry, GroupDoc, Project as OldProject, RecurringTransaction, ResourceFile, ResourceFolder, Student, Task as OldTask, WeeklyPlanDoc } from "@/lib/types";
import * as demo from "./demo";

export interface LiveData {
  mode: "live" | "demo";
  ready: boolean;
  students: Student[];
  transactions: FinanceEntry[];
  recurring: RecurringTransaction[];
  groups: GroupDoc[];
  curriculum: CurriculumLevelDoc[];
  plans: WeeklyPlanDoc[];
  folders: ResourceFolder[];
  files: ResourceFile[];
  error: string | null;
}

const DEMO: LiveData = {
  mode: "demo",
  ready: true,
  students: demo.demoStudents,
  transactions: demo.demoTransactions,
  recurring: demo.demoRecurring,
  groups: demo.demoGroups,
  curriculum: demo.demoCurriculum,
  plans: demo.demoPlans,
  folders: demo.demoFolders,
  files: demo.demoFiles,
  error: null,
};

const SOURCES = {
  students: "students",
  transactions: "transactions",
  recurring: "recurringTransactions",
  groups: "groups",
  curriculum: "curriculum",
  plans: "weeklyPlans",
  folders: "resourceFolders",
  files: "resourceFiles",
} as const;

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : undefined);
const withDates = (d: { id: string; data: () => Record<string, unknown> }) => {
  const raw = d.data();
  return { ...raw, id: d.id, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) };
};

/** v1's tasks/projects, read once — only the v1 → v2 migration needs them (see initCloud). */
export async function fetchV1(): Promise<{ tasks: OldTask[]; projects: OldProject[] }> {
  const [t, p] = await Promise.all([getDocs(collection(db, "tasks")), getDocs(collection(db, "projects"))]);
  return { tasks: t.docs.map(withDates) as unknown as OldTask[], projects: p.docs.map(withDates) as unknown as OldProject[] };
}

const Ctx = createContext<LiveData>(DEMO);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [data, setData] = useState<LiveData>(DEMO);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setData(DEMO);
      return;
    }
    const empty = { ...DEMO, mode: "live" as const, ready: false };
    for (const k of Object.keys(SOURCES)) (empty as any)[k] = [];
    setData(empty);
    const seen = new Set<string>();
    const unsubs = Object.entries(SOURCES).map(([key, name]) =>
      onSnapshot(
        collection(db, name),
        (snap) => {
          const docs = snap.docs.map(withDates);
          seen.add(key);
          setData((prev) => ({ ...prev, [key]: docs, ready: seen.size >= Object.keys(SOURCES).length }));
        },
        (err) => setData((prev) => ({ ...prev, error: err.message }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [user, loading]);

  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);
