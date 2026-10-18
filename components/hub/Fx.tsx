"use client";

/**
 * Reward motion (§9): XP chips flying into the Dock, the level-up burst,
 * achievement reveals and the one full-screen celebration — a boss
 * defeated. Confetti loads lazily so it never weighs on first paint.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { onFx } from "@/lib/hub/fx";
import { getState } from "@/lib/hub/store";
import { ACHIEVEMENTS } from "@/lib/hub/game";
import { Badge } from "./game";
import { spring } from "./ui";

interface Fly {
  id: number;
  amount: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

async function burst(opts: { x: number; y: number; count: number; spread?: number }) {
  if (reduced() || getState().settings.game !== "full") return;
  const confetti = (await import("canvas-confetti")).default;
  const volt = getComputedStyle(document.documentElement).getPropertyValue("--volt").trim() || "#C8F53C";
  confetti({ particleCount: opts.count, spread: opts.spread ?? 70, startVelocity: 28, ticks: 90, scalar: 0.8, origin: { x: opts.x / innerWidth, y: opts.y / innerHeight }, colors: [volt, "#ffffff", "#15151A"], disableForReducedMotion: true });
}

export function FxLayer() {
  const [flies, setFlies] = useState<Fly[]>([]);
  const [ach, setAch] = useState<string | null>(null);
  const [boss, setBoss] = useState(false);

  useEffect(
    () =>
      onFx(async (e) => {
        if (e.type === "xp") {
          const target = document.getElementById("dock-xp")?.getBoundingClientRect();
          const to = target ? { x: target.left + target.width * 0.6, y: target.top } : { x: innerWidth - 120, y: 60 };
          const from = e.from ?? { x: innerWidth / 2, y: innerHeight / 2 };
          const fly = { id: Date.now() + Math.random(), amount: e.amount, from, to };
          setFlies((f) => [...f, fly]);
          setTimeout(() => setFlies((f) => f.filter((x) => x.id !== fly.id)), 900);
        }
        if (e.type === "levelup") {
          const ring = document.querySelector(".dock .level-ring")?.getBoundingClientRect();
          if (ring) burst({ x: ring.left + ring.width / 2, y: ring.top + ring.height / 2, count: 40, spread: 360 });
        }
        if (e.type === "achievement") {
          setAch(e.id);
          setTimeout(() => setAch(null), 3600);
        }
        if (e.type === "boss-defeated") {
          setBoss(true);
          const main = document.getElementById("main")?.getBoundingClientRect();
          if (main && !reduced()) {
            const confetti = (await import("canvas-confetti")).default;
            const end = Date.now() + 1500;
            const frame = () => {
              confetti({ particleCount: 6, spread: 100, startVelocity: 40, origin: { x: (main.left + Math.random() * main.width) / innerWidth, y: 0.2 }, colors: ["#F5C542", "#B26BFF", "#C8F53C", "#ffffff"] });
              if (Date.now() < end) requestAnimationFrame(frame);
            };
            frame();
          }
          setTimeout(() => setBoss(false), 3200);
        }
      }),
    []
  );

  const a = ACHIEVEMENTS.find((x) => x.id === ach);
  return (
    <>
      {flies.map((f) => (
        <motion.span
          key={f.id}
          className="xp-chip xp-fly"
          style={{ left: 0, top: 0 }}
          initial={{ x: f.from.x - 30, y: f.from.y - 11, scale: 0.4, opacity: 0 }}
          animate={
            reduced()
              ? { opacity: [0, 1, 0], x: f.from.x - 30, y: f.from.y - 30 }
              : {
                  x: [f.from.x - 30, f.from.x - 30 + (f.to.x - f.from.x) * 0.35, f.to.x - 30],
                  y: [f.from.y - 11, Math.min(f.from.y, f.to.y) - 80, f.to.y - 11],
                  scale: [1.15, 1, 0.6],
                  opacity: [1, 1, 0],
                }
          }
          transition={{ duration: 0.75, times: [0, 0.45, 1], ease: [0.32, 0.72, 0, 1] }}
        >
          +{f.amount} XP
        </motion.span>
      ))}

      <AnimatePresence>
        {a && (
          <motion.div
            role="status"
            className="card row"
            style={{ position: "fixed", top: 72, left: "50%", x: "-50%", zIndex: 110, gap: 14, padding: "14px 20px 14px 14px", boxShadow: "var(--e3), 0 0 24px var(--glow)" }}
            initial={{ y: -30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, transition: { duration: 0.18 } }}
            transition={spring.reward}
          >
            <motion.span initial={{ rotate: -20, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={spring.reward}>
              <Badge rarity={a.rarity} size={48} glyph={a.name[0]} />
            </motion.span>
            <div className="col" style={{ gap: 2 }}>
              <span className="label" style={{ color: a.rarity === "legendary" ? "var(--gold)" : a.rarity === "epic" ? "var(--epic)" : "var(--accent)" }}>
                {a.rarity} achievement
              </span>
              <span className="headline">{a.name}</span>
              <span className="callout muted">{a.unlock}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {boss && (
          <motion.div
            role="status"
            style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 105, pointerEvents: "none" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div className="card col" style={{ alignItems: "center", padding: 32, boxShadow: "var(--e3), 0 0 48px color-mix(in srgb, var(--gold) 50%, transparent)" }} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.reward}>
              <Badge rarity="legendary" size={88} />
              <span className="label" style={{ color: "var(--gold)" }}>
                Legendary
              </span>
              <span className="display-l">Boss defeated</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
