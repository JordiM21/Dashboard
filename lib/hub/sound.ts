"use client";

/**
 * Sound design: tiny synthesized cues, no audio files. Each lives under
 * ~150 ms and sits low in the mix — felt more than heard. One family of
 * soft sine/triangle tones so every cue sounds like the same app.
 */
import { getState, storeReady } from "./store";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let last = 0;

function ac(): AudioContext | null {
  if (typeof window === "undefined" || document.hidden) return null;
  if (!storeReady() || !getState().settings.sound) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    // Gentle lowpass on everything keeps the cues warm, never clicky-harsh.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    master.connect(lp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  master!.gain.value = Math.max(0, Math.min(1, getState().settings.volume)) * 0.9;
  return ctx;
}

interface Tone {
  f: number; // start frequency
  to?: number; // glide target
  type?: OscillatorType;
  dur?: number; // seconds
  g?: number; // peak gain
  at?: number; // delay
  attack?: number;
}

function tone({ f, to, type = "sine", dur = 0.08, g = 0.05, at = 0, attack = 0.004 }: Tone) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const v = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  v.gain.setValueAtTime(0.0001, t);
  v.gain.exponentialRampToValueAtTime(g, t + attack);
  v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise({ dur = 0.03, g = 0.03, f = 3000, q = 1.2, to, at = 0 }: { dur?: number; g?: number; f?: number; q?: number; to?: number; at?: number }) {
  const c = ac();
  if (!c || !master) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f, t);
  if (to) bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const v = c.createGain();
  v.gain.setValueAtTime(0.0001, t);
  v.gain.exponentialRampToValueAtTime(g, t + Math.min(0.02, dur / 3));
  v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(v).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Debounce so a click that also triggers a toggle never stacks two cues. */
const once = (fn: () => void) => () => {
  const now = performance.now();
  if (now - last < 35) return;
  last = now;
  fn();
};

export const sfx = {
  /** Generic button — a soft wooden tick. */
  tap: once(() => {
    noise({ dur: 0.025, g: 0.035, f: 2600, q: 2 });
    tone({ f: 1250, dur: 0.035, g: 0.018 });
  }),
  /** Sidebar / navigation — a light upward blip. */
  nav: once(() => tone({ f: 620, to: 840, dur: 0.07, g: 0.035, type: "triangle" })),
  /** Segmented controls, toggles, pills. */
  toggle: once(() => {
    tone({ f: 980, dur: 0.03, g: 0.025, type: "triangle" });
    tone({ f: 1320, dur: 0.03, g: 0.018, type: "triangle", at: 0.028 });
  }),
  /** Primary action — a round, confident pop. */
  primary: once(() => tone({ f: 420, to: 700, dur: 0.09, g: 0.06 })),
  /** Completing a checkbox — a warm rising fifth. */
  check: once(() => {
    tone({ f: 784, dur: 0.12, g: 0.045, type: "triangle" });
    tone({ f: 1175, dur: 0.18, g: 0.04, type: "triangle", at: 0.06 });
  }),
  /** Un-checking. */
  uncheck: once(() => tone({ f: 700, to: 520, dur: 0.08, g: 0.03, type: "triangle" })),
  /** Panels and sheets. */
  open: once(() => tone({ f: 380, to: 520, dur: 0.09, g: 0.03 })),
  close: once(() => tone({ f: 520, to: 360, dur: 0.08, g: 0.025 })),
  /** Page transition — barely-there air. */
  page: () => noise({ dur: 0.16, g: 0.012, f: 500, to: 1600, q: 0.8 }),
  /** Keyboard selector step. */
  step: () => tone({ f: 1500, dur: 0.018, g: 0.012, type: "triangle" }),
  /** XP lands in the Dock — a small sparkle. */
  xp: () => [1319, 1760, 2093].forEach((f, i) => tone({ f, dur: 0.09, g: 0.022, at: i * 0.045 })),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.5, g: 0.04, type: "triangle", at: i * 0.07 })),
  achievement: () => {
    tone({ f: 1568, dur: 0.6, g: 0.035 });
    tone({ f: 2349, dur: 0.7, g: 0.02, at: 0.08 });
  },
  undo: once(() => tone({ f: 660, to: 440, dur: 0.1, g: 0.03 })),
};

/** Picks the cue for whatever was clicked, so every surface sounds a little different. */
export function sfxFor(el: Element | null): void {
  const t = el?.closest<HTMLElement>("[data-sound], button, a, [role=checkbox], [role=option], summary, select");
  if (!t || (t as HTMLButtonElement).disabled) return;
  const named = t.dataset.sound as keyof typeof sfx | "none" | undefined;
  if (named === "none") return;
  if (named && named in sfx) return void sfx[named]();
  if (t.matches(".check, [role=checkbox]")) return t.getAttribute("aria-checked") === "true" ? sfx.uncheck() : sfx.check();
  if (t.closest(".sb-row, .sidebar a")) return sfx.nav();
  if (t.closest(".seg, .filter-pill, .day-pill") || t.matches("[aria-pressed]")) return sfx.toggle();
  if (t.matches(".btn-primary, .btn-hero, .btn-accent")) return sfx.primary();
  if (t.closest(".toast")) return sfx.undo();
  sfx.tap();
}
