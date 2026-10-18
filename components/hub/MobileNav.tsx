"use client";

/**
 * Phone chrome (Feature Spec §3: mobile shows Today, Inbox, Tasks, Academy
 * and More). Bottom tab bar within thumb reach, a floating "+" so capture is
 * one tap from anywhere, and the Player Dock folded into a chip that opens
 * as a sheet.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Sun, Tray, CheckSquare, GraduationCap, DotsThreeCircle, Plus, Target, Wallet, Books, SquaresFour, Timer, GearSix, MagnifyingGlass, UserCircle, SignIn, PlugsConnected } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { levelFromXp, xpByArea } from "@/lib/hub/game";
import Dock, { usePlayer } from "./Dock";
import { LevelRing, Flame } from "./game";
import { AreaDot, Sheet, spring } from "./ui";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Tray },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/academy", label: "Academy", icon: GraduationCap },
];

const MORE = [
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/library", label: "Library", icon: Books },
  { href: "/collections", label: "Collections", icon: SquaresFour },
  { href: "/time", label: "Time", icon: Timer },
  { href: "/connections", label: "Connections", icon: PlugsConnected },
  { href: "/character", label: "Character", icon: UserCircle },
];

export function TabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const path = usePathname() ?? "";
  const s = useHub();
  const inbox = s.tasks.filter((t) => t.status === "inbox" && !t.archivedAt).length;
  const onTab = TABS.some((t) => path.startsWith(t.href));
  const items = [...TABS.map((t) => ({ ...t, active: !moreOpen && path.startsWith(t.href) })), { href: "", label: "More", icon: DotsThreeCircle, active: moreOpen || !onTab }];
  return (
    <nav className="tabbar" aria-label="Primary">
      {items.map((t) => {
        const I = t.icon;
        const inner = (
          <>
            {t.active && <motion.span layoutId="tab-pill" className="tab-pill" transition={spring.ui} />}
            <span className="tab-icon">
              <I size={24} weight={t.active ? "fill" : "regular"} />
              {t.href === "/inbox" && inbox > 0 && <span className="tab-badge">{inbox}</span>}
            </span>
            <span className="tab-label">{t.label}</span>
          </>
        );
        return t.href ? (
          <Link key={t.label} href={t.href} className="tab" aria-current={t.active ? "page" : undefined} data-sound="nav">
            {inner}
          </Link>
        ) : (
          <button key={t.label} className="tab" aria-expanded={moreOpen} onClick={onMore} data-sound="nav">
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

export function Fab({ onClick, hidden }: { onClick: () => void; hidden: boolean }) {
  return (
    <motion.button
      className="fab"
      aria-label="Quick add"
      onClick={onClick}
      animate={{ scale: hidden ? 0.6 : 1, opacity: hidden ? 0 : 1 }}
      transition={spring.ui}
      style={{ pointerEvents: hidden ? "none" : "auto" }}
      whileTap={{ scale: 0.9 }}
      data-sound="primary"
    >
      <Plus size={26} weight="bold" />
    </motion.button>
  );
}

/** Level + streak, always visible on phones (Design Guide §1: the player is always present). */
export function PlayerChip({ onClick }: { onClick: () => void }) {
  const p = usePlayer();
  return (
    <button className="player-chip" onClick={onClick} aria-label={`Level ${p.level}, ${p.streak.current}-day streak`}>
      <span id="dock-xp" style={{ display: "contents" }}>
        <LevelRing pct={p.pct} level={p.level} size={30} stroke={3} />
      </span>
      <span className="row" style={{ gap: 2 }}>
        <Flame size={16} live={p.streak.current >= 3} />
        <b style={{ color: "var(--ember)", fontSize: 13 }}>{p.streak.current}</b>
      </span>
    </button>
  );
}

export function PlayerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Player">
      <div className="dock-in-sheet">
        <Dock rail={false} />
      </div>
    </Sheet>
  );
}

export function MoreSheet({ open, onClose, onSearch, onSettings }: { open: boolean; onClose: () => void; onSearch: () => void; onSettings: () => void }) {
  const s = useHub();
  const live = useLive();
  const router = useRouter();
  const path = usePathname() ?? "";
  const areaXp = xpByArea(s.game.xp);
  const areas = s.areas.filter((a) => a.active && !a.archivedAt).sort((a, b) => a.sort - b.sort);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <Sheet open={open} onClose={onClose} label="More">
      <button className="sb-search" style={{ height: 44, marginBottom: 4 }} onClick={() => (onClose(), onSearch())}>
        <MagnifyingGlass size={18} />
        <span className="grow" style={{ textAlign: "left" }}>
          Search everything
        </span>
      </button>
      <div className="more-grid">
        {MORE.map((m) => {
          const I = m.icon;
          const on = path.startsWith(m.href);
          return (
            <button key={m.href} className="more-tile" aria-current={on ? "page" : undefined} onClick={() => go(m.href)} data-sound="nav">
              <I size={26} weight={on ? "fill" : "duotone"} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
      <div className="label" style={{ marginTop: 4 }}>
        Area filter
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="chip chip-lg" aria-pressed={s.ui.area === "all"} onClick={() => A.setUi({ area: "all" })}>
          All areas
        </button>
        {areas.map((a) => (
          <button key={a.id} className="chip chip-lg chip-area" aria-pressed={s.ui.area === a.id} style={{ "--c": a.color } as CSSProperties} onClick={() => A.setUi({ area: s.ui.area === a.id ? "all" : a.id })}>
            <AreaDot area={a} /> {a.name}
            <span className="faint">Lv {levelFromXp(areaXp[a.id] ?? 0).level}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {live.mode === "demo" && (
          <Link href="/login" className="btn grow" onClick={onClose}>
            <SignIn size={16} /> Sign in for live data
          </Link>
        )}
        <button className="btn grow" onClick={() => (onClose(), onSettings())}>
          <GearSix size={16} /> Settings
        </button>
      </div>
    </Sheet>
  );
}
