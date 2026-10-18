"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import {
  Sun, Tray, CheckSquare, Target, GraduationCap, Wallet, Books, SquaresFour, Timer, MagnifyingGlass, GearSix, SidebarSimple, SignIn, PushPin, Kanban, PlugsConnected,
  type Icon,
} from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useLive } from "@/lib/hub/live";
import { levelFromXp, xpByArea, isFocus } from "@/lib/hub/game";
import * as A from "@/lib/hub/actions";
import { today } from "@/lib/hub/util";
import { useShell, type Rec } from "./Shell";
import { spring } from "./ui";

const AREA_PAGES = ["/today", "/tasks", "/goals", "/library", "/collections"];

export const NAV: { href: string; label: string; icon: Icon }[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Tray },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/academy", label: "Academy", icon: GraduationCap },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/library", label: "Library", icon: Books },
  { href: "/collections", label: "Collections", icon: SquaresFour },
  { href: "/time", label: "Time", icon: Timer },
  { href: "/connections", label: "Connections", icon: PlugsConnected },
];

export default function Sidebar({ rail }: { rail: boolean }) {
  const s = useHub();
  const path = usePathname() ?? "";
  const router = useRouter();
  const { palette, settings, inspect } = useShell();
  const { user } = useAuth();
  const live = useLive();
  const t = today();
  const inbox = s.tasks.filter((x) => x.status === "inbox" && !x.archivedAt).length;
  const focus = s.tasks.filter((x) => isFocus(x, t)).length;
  const counts: Record<string, number> = { "/inbox": inbox, "/tasks": focus };
  const areaXp = xpByArea(s.game.xp);
  const favs: { label: string; icon: Icon; rec?: Rec; href?: string }[] = [
    ...s.notes.filter((n) => n.pinned && !n.archivedAt).slice(0, 3).map((n) => ({ label: n.title, icon: PushPin, rec: { kind: "note" as const, id: n.id } })),
    ...s.projects.filter((p) => p.status === "active" && !p.archivedAt).slice(0, 3).map((p) => ({ label: p.title, icon: Kanban, href: `/tasks/p/${p.id}` })),
  ];

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sb-brand">
        <span className="sb-logo">H</span>
        <span className="headline sb-hide">Hub</span>
        <span className="spacer sb-hide" />
        <button className="icon-btn sb-hide" title="Collapse sidebar (Ctrl \)" onClick={() => A.setSettings({ sidebar: "rail" })} aria-label="Collapse sidebar">
          <SidebarSimple size={18} />
        </button>
      </div>
      <button className="sb-search" onClick={palette} aria-label="Search (Space)">
        <MagnifyingGlass size={16} />
        <span className="sb-hide callout grow" style={{ textAlign: "left" }}>
          Search
        </span>
        <span className="kbd sb-hide">Space</span>
      </button>

      {NAV.map((n, i) => {
        const active = path === n.href || path.startsWith(n.href + "/") || (n.href === "/goals" && path.startsWith("/character"));
        const I = n.icon;
        return (
          <Link key={n.href} href={n.href} className="sb-row" aria-current={active ? "page" : undefined} title={i < 9 ? `${n.label} (${i + 1})` : n.label} onMouseEnter={() => router.prefetch(n.href)}>
            {active && <motion.span layoutId="sb-pill" className="sb-pill" transition={spring.ui} />}
            <I size={20} weight={active ? "fill" : "regular"} />
            <span className="sb-hide">{n.label}</span>
            {counts[n.href] ? <span className="sb-count sb-hide">{counts[n.href]}</span> : null}
            {i < 9 && <span className={`sb-key sb-hide ${counts[n.href] ? "" : "solo"}`}>{i + 1}</span>}
          </Link>
        );
      })}

      <div className="sb-section label sb-hide">Areas</div>
      {s.areas
        .filter((a) => a.active && !a.archivedAt)
        .sort((a, b) => a.sort - b.sort)
        .map((a) => {
          const on = s.ui.area === a.id;
          return (
            <button
              key={a.id}
              className="sb-row sb-row-sm"
              aria-pressed={on}
              title={`${a.name} · filter`}
              onClick={() => {
                A.setUi({ area: on ? "all" : a.id });
                // The filter only shapes Today, Tasks, Goals, Library and Collections — elsewhere, take you to the tasks.
                if (!on && !AREA_PAGES.some((p) => path.startsWith(p))) router.push("/tasks");
              }}
              style={on ? { background: `color-mix(in srgb, ${a.color} 14%, transparent)` } : undefined}
            >
              <span className="sb-dot" style={{ background: a.color } as CSSProperties} />
              <span className="sb-hide truncate">{a.name}</span>
              <span className="lvl-chip sb-hide">Lv {levelFromXp(areaXp[a.id] ?? 0).level}</span>
            </button>
          );
        })}

      {favs.length > 0 && <div className="sb-section label sb-hide">Favourites</div>}
      {!rail &&
        favs.map((f) => {
          const I = f.icon;
          const inner = (
            <>
              <I size={16} className="faint" />
              <span className="truncate callout">{f.label}</span>
            </>
          );
          return f.href ? (
            <Link key={f.label} href={f.href} className="sb-row">
              {inner}
            </Link>
          ) : (
            <button key={f.label} className="sb-row" onClick={() => f.rec && inspect(f.rec)}>
              {inner}
            </button>
          );
        })}

      <div className="sb-foot">
        {live.mode === "demo" && (
          <Link href="/login" className="sb-row" title="Demo data — sign in for live data">
            <SignIn size={20} />
            <span className="sb-hide callout">Demo data · Sign in</span>
          </Link>
        )}
        {rail && (
          <button className="sb-row" onClick={() => A.setSettings({ sidebar: "open" })} title="Expand sidebar (Ctrl \)" aria-label="Expand sidebar">
            <SidebarSimple size={20} />
          </button>
        )}
        <button className="sb-row" onClick={settings} title="Settings">
          <GearSix size={20} />
          <span className="sb-hide">Settings</span>
          {user && <span className="sb-count sb-hide truncate" style={{ maxWidth: 90 }}>{user.email}</span>}
        </button>
      </div>
    </nav>
  );
}
