/**
 * Sound effects for the Teaching view's gamification bar. Each play*()
 * below tries a real recorded file first (`/public/sounds/{name}.mp3` — see
 * that folder's README for exactly which filenames it looks for) and falls
 * back to a synthesized Web Audio tone if the file is missing, so this
 * works with zero assets out of the box and automatically upgrades the
 * moment real files are dropped in — no code changes needed either way.
 *
 * Deliberately NOT an <iframe> embed of a third-party soundboard site
 * (e.g. myinstants.com): a cross-origin iframe can't be triggered by this
 * page's JavaScript at all — clicking our button has no way to reach
 * inside someone else's embedded player, so it would just show a widget a
 * person has to click themselves, defeating the "quick-trigger button"
 * point entirely. It would also mean bundling redistribution of another
 * site's audio without a clear license to do so. A real MP3 file dropped
 * into public/sounds/ is what actually works.
 *
 * One shared AudioContext for the synthesized fallback, created lazily on
 * first use — browsers block audio until a user gesture, and every one of
 * these is only ever called from a button's onClick, so that's satisfied
 * automatically.
 */

// Per-filename cache of whether a real sound file exists, so a miss only
// costs one failed probe (the module reloads on next page load anyway).
const fileAvailability = new Map<string, boolean>();

/** Tries to play /sounds/{name}.mp3 — resolves true only once playback has actually started (waits for canplaythrough, not just a same-tick play() call, since a 404 doesn't reject synchronously). */
function tryPlayFile(name: string): Promise<boolean> {
  if (typeof Audio === "undefined") return Promise.resolve(false);
  if (fileAvailability.get(name) === false) return Promise.resolve(false);

  return new Promise((resolve) => {
    const audio = new Audio(`/sounds/${name}.mp3`);
    audio.volume = 0.9;
    let settled = false;

    const fail = () => {
      if (settled) return;
      settled = true;
      fileAvailability.set(name, false);
      resolve(false);
    };
    const ready = () => {
      if (settled) return;
      settled = true;
      fileAvailability.set(name, true);
      audio.play().then(() => resolve(true)).catch(fail);
    };

    audio.addEventListener("error", fail, { once: true });
    audio.addEventListener("canplaythrough", ready, { once: true });
    audio.load();
    // Safety net — never let a stalled network request hang the button click.
    setTimeout(fail, 800);
  });
}

let ctx: AudioContext | null = null;

/**
 * Creating the AudioContext synchronously inside the button's onClick (not
 * after an earlier `await`) is what satisfies browsers' autoplay-gesture
 * requirement — every exported play*() below calls this first thing.
 * `resume()` is awaited (not fire-and-forget) so scheduling never races a
 * still-"suspended" context, which is the usual cause of a silently
 * swallowed first click.
 */
async function getContext(): Promise<AudioContext> {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

/** Releases the shared AudioContext — call on the Teaching view's unmount so navigating away doesn't leave it open (browsers cap how many can exist at once per page). */
export function closeAudioContext() {
  if (ctx && ctx.state !== "closed") void ctx.close();
  ctx = null;
}

function tone(
  audioCtx: AudioContext,
  { freq, start, duration, type = "sine", peakGain = 0.25, destination }: {
    freq: number;
    start: number;
    duration: number;
    type?: OscillatorType;
    peakGain?: number;
    destination: AudioNode;
  }
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noiseBurst(
  audioCtx: AudioContext,
  { start, duration, peakGain = 0.3, filterFreq = 1200, destination }: {
    start: number;
    duration: number;
    peakGain?: number;
    filterFreq?: number;
    destination: AudioNode;
  }
) {
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  source.connect(filter).connect(gain).connect(destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

/** Bright ascending chime — pairs with the confetti burst. */
async function synthConfettiChime() {
  const audioCtx = await getContext();
  const master = audioCtx.createGain();
  master.gain.value = 0.35;
  master.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  [880, 1108.73, 1318.51, 1760].forEach((freq, i) => {
    tone(audioCtx, { freq, start: now + i * 0.06, duration: 0.35, type: "triangle", peakGain: 0.3, destination: master });
  });
}

/** Ascending major arpeggio into a held chord — a short victory fanfare. */
async function synthVictoryFanfare() {
  const audioCtx = await getContext();
  const master = audioCtx.createGain();
  master.gain.value = 0.35;
  master.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  const run = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  run.forEach((freq, i) => {
    tone(audioCtx, { freq, start: now + i * 0.11, duration: 0.22, type: "sawtooth", peakGain: 0.22, destination: master });
  });
  const chordStart = now + run.length * 0.11 + 0.05;
  [523.25, 659.25, 783.99].forEach((freq) => {
    tone(audioCtx, { freq, start: chordStart, duration: 0.9, type: "sawtooth", peakGain: 0.16, destination: master });
  });
}

/** Rapid, accelerating noise bursts ending in a low thump — classic "drum roll into a hit." */
async function synthDrumRoll() {
  const audioCtx = await getContext();
  const master = audioCtx.createGain();
  master.gain.value = 0.4;
  master.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  let t = now;
  let interval = 0.16;
  const rollEnd = now + 1.4;
  while (t < rollEnd) {
    noiseBurst(audioCtx, { start: t, duration: interval * 0.9, peakGain: 0.25, filterFreq: 300, destination: master });
    t += interval;
    interval = Math.max(0.045, interval * 0.88); // accelerate
  }

  // The hit: a low thump plus a bright crash.
  tone(audioCtx, { freq: 90, start: rollEnd, duration: 0.5, type: "sine", peakGain: 0.6, destination: master });
  noiseBurst(audioCtx, { start: rollEnd, duration: 0.6, peakGain: 0.35, filterFreq: 3500, destination: master });
}

/** Randomized filtered-noise claps layered over ~1.6s — approximates a crowd cheering. */
async function synthApplause() {
  const audioCtx = await getContext();
  const master = audioCtx.createGain();
  master.gain.value = 0.4;
  master.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  const clapCount = 28;
  for (let i = 0; i < clapCount; i++) {
    const start = now + Math.random() * 1.4;
    noiseBurst(audioCtx, {
      start,
      duration: 0.06 + Math.random() * 0.05,
      peakGain: 0.12 + Math.random() * 0.1,
      filterFreq: 1800 + Math.random() * 2200,
      destination: master,
    });
  }
  // A couple of low "whoop" cheers under the claps.
  [now + 0.1, now + 0.6].forEach((start) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, start);
    osc.frequency.exponentialRampToValueAtTime(700, start + 0.5);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

// ---------------------------------------------------------------------------
// Public API — each tries the matching /sounds/{name}.mp3 first, falling
// back to the synthesized version above if it's missing.
// ---------------------------------------------------------------------------

export async function playConfettiChime() {
  if (await tryPlayFile("confetti")) return;
  await synthConfettiChime();
}

export async function playVictoryFanfare() {
  if (await tryPlayFile("victory")) return;
  await synthVictoryFanfare();
}

export async function playDrumRoll() {
  if (await tryPlayFile("drumroll")) return;
  await synthDrumRoll();
}

export async function playApplause() {
  if (await tryPlayFile("applause")) return;
  await synthApplause();
}
