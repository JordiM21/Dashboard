"use client";

/**
 * The wired sources (Feature Spec §1 "stays"): students, Stripe-fed
 * transactions, recurring bills, groups, curriculum, lessons and the
 * resource library, read live from Firestore when signed in. Signed out
 * (local preview) the same shapes come from lib/hub/demo.ts. v2 never
 * writes to these collections — its own records live in lib/hub/store.ts.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
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
  oldTasks: OldTask[] | null;
  oldProjects: OldProject[] | null;
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
  oldTasks: null,
  oldProjects: null,
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
  oldTasks: "tasks",
  oldProjects: "projects",
} as const;

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : undefined);

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
    const empty = { ...DEMO, mode: "live" as const, ready: false, oldTasks: null, oldProjects: null };
    for (const k of Object.keys(SOURCES)) (empty as any)[k] = k === "oldTasks" || k === "oldProjects" ? null : [];
    setData(empty);
    const seen = new Set<string>();
    const unsubs = Object.entries(SOURCES).map(([key, name]) =>
      onSnapshot(
        collection(db, name),
        (snap) => {
          const docs = snap.docs.map((d) => {
            const raw = d.data();
            return { ...raw, id: d.id, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) };
          });
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
