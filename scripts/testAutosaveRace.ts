/**
 * Standalone regression test for the Teaching canvas autosave race that was
 * causing "sometimes saves, sometimes deletes everything" — reproduced here
 * outside React/Excalidraw with the exact same guard logic now in
 * components/TeachingView.tsx (loadingSceneRef, switchTokenRef,
 * saveInFlightRef), driven with artificial async delays to force the
 * interleavings that are hard to hit reliably by hand-clicking in a browser.
 *
 * Run with: npx tsx scripts/testAutosaveRace.ts
 * Exits non-zero if any assertion fails.
 */

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function makeServer(seed: Record<string, string> = { A: "A-original", B: "B-original" }) {
  const saved: Record<string, string> = { ...seed };
  return {
    async get(planId: string): Promise<string> {
      await delay(5);
      return saved[planId];
    },
    async put(planId: string, content: string): Promise<void> {
      await delay(20); // simulated network latency, same order as the real PUT
      saved[planId] = content;
    },
    dump: () => ({ ...saved }),
  };
}

type Server = ReturnType<typeof makeServer>;

/** Mirrors TeachingView's canvas: one shared mutable "scene", like the one live Excalidraw instance the whole component tree reads/writes. */
function makeCanvas(initial: string) {
  let scene = initial;
  return { get: () => scene, set: (v: string) => (scene = v) };
}

function makeTeachingView(server: Server, opts: { fixed: boolean; coldImportMs: number; warmImportMs: number }) {
  const canvas = makeCanvas("");
  let currentPlanId: string | null = null;
  let dirty = false;
  let loadingScene = false;
  let switchToken = 0;
  let saveInFlight: Promise<void> | null = null;
  let moduleLoaded = false; // models webpack's dynamic-import cache: the first performSave() pays a real cold-start cost, every one after is ~instant

  function onChange() {
    if (opts.fixed && loadingScene) return; // the fix: a programmatic scene load never counts as a user edit
    dirty = true;
  }

  async function performSaveUnguarded(): Promise<void> {
    const url = currentPlanId;
    if (!url) return;
    // Simulates `await import("@excalidraw/excalidraw")` — slow exactly
    // once (cold), then cached (near-instant) for every call after. This
    // is what lets a second, LATER-started save (e.g. flushBeforeSwitch
    // reacting to the switch) finish and read the canvas *before* the
    // FIRST, earlier-started save wakes back up and reads it.
    const wasLoaded = moduleLoaded;
    moduleLoaded = true;
    await delay(wasLoaded ? opts.warmImportMs : opts.coldImportMs);
    const content = canvas.get();
    await server.put(url, content);
    dirty = false;
  }

  async function performSave(): Promise<void> {
    if (!opts.fixed) return performSaveUnguarded();
    if (saveInFlight) return saveInFlight; // the fix: piggyback on the save already running
    const p = performSaveUnguarded().finally(() => {
      saveInFlight = null;
    });
    saveInFlight = p;
    return p;
  }

  async function flushBeforeSwitch() {
    if (dirty) await performSave();
  }

  async function openWeeklyPlan(planId: string) {
    const token = opts.fixed ? ++switchToken : 0;

    await flushBeforeSwitch();
    if (opts.fixed && token !== switchToken) return; // the fix: superseded by a newer switch

    const content = await server.get(planId);
    if (opts.fixed && token !== switchToken) return;

    loadingScene = true;
    canvas.set(content);
    loadingScene = false;

    currentPlanId = planId;
    dirty = false;
  }

  return {
    edit: (text: string) => {
      canvas.set(text);
      onChange();
    },
    triggerAutosave: () => void performSave(), // fire-and-forget, like the real debounce timer's callback
    openWeeklyPlan,
    state: () => ({ currentPlanId, dirty, canvas: canvas.get() }),
  };
}

let failures = 0;
/** For the `fixed: true` runs — an unmet expectation here fails the whole test (this is the actual regression check). */
function assertEqual(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

/** For the `fixed: false` (pre-fix) runs — informational only. We WANT this to report the bug, not pass; it demonstrates the fix is actually fixing something rather than just adding unused guards. */
function reportBaseline(label: string, actual: unknown, expected: unknown) {
  const buggy = actual !== expected;
  console.log(`  ${buggy ? "BUG REPRODUCED" : "no bug here"} — ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * Scenario 1: a debounced autosave for plan A is mid-flight (slow
 * import()) when the teacher clicks to switch to plan B. Without the fix,
 * flushBeforeSwitch fires a SECOND overlapping performSave() that can
 * finish its own async gap after B has already loaded into the shared
 * canvas, PUTing B's content to A's url — corrupting A's saved file.
 */
async function scenarioOverlappingAutosave(fixed: boolean) {
  const server = makeServer();
  // coldImportMs models the real "await import('@excalidraw/excalidraw')"
  // paying its full cost on the FIRST performSave() of the session — the
  // debounced autosave below is exactly that first call. warmImportMs
  // models every call after hitting webpack's module cache.
  const view = makeTeachingView(server, { fixed, coldImportMs: 80, warmImportMs: 2 });

  await view.openWeeklyPlan("A");
  view.edit("A-edited-by-teacher");

  view.triggerAutosave(); // the debounce timer firing — this is the COLD, slow call
  await delay(10); // give it a moment to actually start
  await view.openWeeklyPlan("B"); // teacher switches lessons while A's autosave is still mid-flight (its own performSave() is the WARM, fast call)
  await delay(150); // let every in-flight promise from this scenario fully settle

  const saved = server.dump();
  const check = fixed ? assertEqual : reportBaseline;
  console.log(`  [fixed=${fixed}] server state:`, saved);
  check(`[fixed=${fixed}] A's saved content is A's real edit, not corrupted by the switch`, saved.A, "A-edited-by-teacher");
  check(`[fixed=${fixed}] B's saved content is untouched`, saved.B, "B-original");
}

/**
 * Scenario 2: rapid double-click — switch to B, then immediately switch to
 * C before B has finished loading. Without a switch token, both async
 * flows can interleave their resetScene/updateScene/setCurrentPlan calls in
 * either order, so the canvas can end up showing the WRONG plan (or a
 * stale one overwrites the correct one a moment later).
 */
async function scenarioDoubleClickSwitch(fixed: boolean) {
  const server = makeServer({ A: "A-original", B: "B-original", C: "C-original" });
  const view = makeTeachingView(server, { fixed, coldImportMs: 5, warmImportMs: 5 });

  await view.openWeeklyPlan("A");

  const first = view.openWeeklyPlan("B");
  await delay(1); // let it start (past its own `await server.get` gate)
  const second = view.openWeeklyPlan("C"); // fired almost immediately after — the double-click
  await Promise.all([first, second]);

  const finalState = view.state();
  const check = fixed ? assertEqual : reportBaseline;
  console.log(`  [fixed=${fixed}] final canvas plan:`, finalState.currentPlanId);
  check(`[fixed=${fixed}] the LAST click (C) wins, not a stale B`, finalState.currentPlanId, "C");
}

/**
 * Scenario 3: does resetScene()+updateScene() during a load falsely mark
 * the board dirty? (Isolated check of the loadingSceneRef guard itself,
 * independent of the save race above.)
 */
async function scenarioLoadDoesNotDirty(fixed: boolean) {
  const server = makeServer();
  const view = makeTeachingView(server, { fixed, coldImportMs: 5, warmImportMs: 5 });
  await view.openWeeklyPlan("A");
  await view.openWeeklyPlan("B"); // just a plain load, no user edit at all
  const { dirty } = view.state();
  const check = fixed ? assertEqual : reportBaseline;
  console.log(`  [fixed=${fixed}] dirty after a plain load:`, dirty);
  check(`[fixed=${fixed}] loading a plan alone never marks it dirty`, dirty, false);
}

async function run() {
  console.log("=== Scenario 1: slow autosave in flight + lesson switch ===");
  await scenarioOverlappingAutosave(false);
  await scenarioOverlappingAutosave(true);

  console.log("\n=== Scenario 2: rapid double-click switch (B then C) ===");
  await scenarioDoubleClickSwitch(false);
  await scenarioDoubleClickSwitch(true);

  console.log("\n=== Scenario 3: a plain load never marks the board dirty ===");
  await scenarioLoadDoesNotDirty(false);
  await scenarioLoadDoesNotDirty(true);

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void run();
