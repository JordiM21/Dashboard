import type { Project as OldProject, Task as OldTask } from "@/lib/types";
import type { Area, Collection, Goal, HubState, Item, Note, Priority, Project, Task, Template, TimeEntry, XpEvent } from "./types";
import { addDays, localIso, nowIso, today, uid, weekStart } from "./util";

export const STATE_VERSION = 1;

export const DEFAULT_SETTINGS: HubState["settings"] = {
  game: "full", restDay: 0, theme: "system", sidebar: "auto", dock: "auto", ownerName: "Jordi",
  sound: true, volume: 0.5, navKeys: "arrows", keys: {},
};

const ts = (d: string = today()) => `${d}T09:00:00.000`;
const base = (d?: string) => ({ id: uid(), createdAt: ts(d), updatedAt: ts(d), archivedAt: null });

export const AREAS: Area[] = [
  { id: "let", name: "LET Junior", color: "#FF6B4A", icon: "GraduationCap", sort: 0 },
  { id: "studies", name: "Studies", color: "#3AA0FF", icon: "BookOpen", sort: 1 },
  { id: "rel", name: "Relationship", color: "#FF5C9A", icon: "Heart", sort: 2 },
  { id: "personal", name: "Personal", color: "#2FC9A0", icon: "User", sort: 3 },
  { id: "hobbies", name: "Hobbies", color: "#8F7CFF", icon: "GameController", sort: 4 },
  { id: "home", name: "Home", color: "#8C9AA8", icon: "House", sort: 5 },
].map((a) => ({ ...a, active: true, createdAt: ts(), updatedAt: ts(), archivedAt: null }));

export const COLLECTION_TEMPLATES: Omit<Collection, keyof ReturnType<typeof base>>[] = [
  {
    name: "Games backlog", areaId: "hobbies", icon: "GameController", view: "grid", boardField: "status", doneField: "status", doneValue: "Finished",
    fields: [
      { key: "platform", label: "Platform", type: "select", options: ["PC", "PS5", "Switch", "Steam Deck"] },
      { key: "status", label: "Status", type: "select", options: ["Backlog", "Playing", "Finished", "Dropped"] },
      { key: "hours", label: "Hours", type: "number" },
      { key: "rating", label: "Rating", type: "number" },
    ],
  },
  {
    name: "In-game objectives", areaId: "hobbies", icon: "Target", view: "list", doneField: "done", doneValue: "true",
    fields: [
      { key: "game", label: "Game", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "done", label: "Done", type: "checkbox" },
    ],
  },
  {
    name: "Wishlist", areaId: "personal", icon: "Gift", view: "list", boardField: "priority",
    fields: [
      { key: "price", label: "Price", type: "number" },
      { key: "priority", label: "Priority", type: "select", options: ["Must", "Want", "Maybe"] },
      { key: "url", label: "Link", type: "url" },
    ],
  },
  {
    name: "Books & media", areaId: "studies", icon: "Books", view: "board", boardField: "status", doneField: "status", doneValue: "Done",
    fields: [
      { key: "kind", label: "Kind", type: "select", options: ["Book", "Course", "Film", "Series", "Podcast"] },
      { key: "status", label: "Status", type: "select", options: ["Queued", "In progress", "Done"] },
    ],
  },
  {
    name: "Places to visit", areaId: "rel", icon: "MapPin", view: "grid", doneField: "visited", doneValue: "true",
    fields: [
      { key: "city", label: "City", type: "text" },
      { key: "budget", label: "Budget", type: "number" },
      { key: "visited", label: "Visited", type: "checkbox" },
    ],
  },
  {
    name: "Important dates", areaId: "rel", icon: "CalendarHeart", view: "list",
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "remind", label: "Remind days before", type: "number" },
      { key: "kind", label: "Kind", type: "select", options: ["Birthday", "Anniversary", "Renewal", "Other"] },
    ],
  },
];

export const TEMPLATES: Template[] = [
  {
    id: "tpl-onboard", name: "Onboard new student", areaId: "let",
    tasks: [
      { title: "Send welcome message to parent", offsetDays: 0, priority: 1, estimate: 10 },
      { title: "Add student to group chat", offsetDays: 0, priority: 2, estimate: 5 },
      { title: "Share level placement & materials", offsetDays: 1, priority: 2, estimate: 20 },
      { title: "First-week check-in with parent", offsetDays: 7, priority: 2, estimate: 10 },
    ],
  },
  {
    id: "tpl-close", name: "Monthly close", areaId: "let",
    tasks: [
      { title: "Reconcile Stripe payouts", offsetDays: 0, priority: 1, estimate: 30 },
      { title: "Log ad spend for the month", offsetDays: 0, priority: 2, estimate: 5 },
      { title: "Chase late payments", offsetDays: 1, priority: 1, estimate: 20 },
      { title: "Monthly review", offsetDays: 2, priority: 2, estimate: 30 },
    ],
  },
  {
    id: "tpl-meta", name: "Launch Meta campaign", areaId: "let",
    tasks: [
      { title: "Write ad copy (3 variants)", offsetDays: 0, priority: 2, estimate: 45 },
      { title: "Design creatives in Canva", offsetDays: 1, priority: 2, estimate: 60 },
      { title: "Set up lead form & audience", offsetDays: 2, priority: 1, estimate: 30 },
      { title: "Check cost per lead after 3 days", offsetDays: 5, priority: 2, estimate: 15 },
    ],
  },
];

export function makeTask(p: Partial<Task> & { title: string }): Task {
  return {
    ...base(),
    notes: "",
    areaId: "let",
    projectId: null,
    status: "next",
    priority: 2,
    due: null,
    scheduled: null,
    estimate: null,
    recurrence: null,
    checklist: [],
    completedAt: null,
    log: [],
    ...p,
  };
}

function emptyState(): HubState {
  const mrr: Goal = {
    ...base(), title: "Defeat the $1,500 MRR boss", areaId: "let", horizon: "year", metric: "mrr", target: 1500, start: 0, unit: "$",
    deadline: `${today().slice(0, 4)}-12-31`, pinned: true, log: [],
  };
  return {
    version: STATE_VERSION,
    areas: AREAS,
    tasks: [],
    projects: [],
    goals: [mrr],
    notes: [],
    collections: COLLECTION_TEMPLATES.map((c) => ({ ...base(), ...c })),
    items: [],
    time: [],
    lessons: [],
    expenses: [],
    templates: TEMPLATES,
    studentMeta: {},
    groupMeta: {},
    adSpend: {},
    game: { xp: [], dayPlans: {}, inboxZeroDays: [], unlocked: {}, seenActive: [], automations: {} },
    reviews: [],
    monthly: [],
    settings: DEFAULT_SETTINGS,
    ui: { area: "all", taskView: "projects", listGroup: "area", finScope: "business" },
  };
}

const OLD_PRIORITY: Record<string, Priority> = { Urgent: 1, High: 1, Medium: 2, Low: 3 };

/**
 * Phase 1 migration: every existing task and project comes across with an
 * Area (LET Junior unless a tag names another area). Nothing in Firestore
 * is modified — this copies into the local v2 store once.
 */
export function liveSeed(oldTasks: OldTask[], oldProjects: OldProject[]): HubState {
  const s = emptyState();
  const areaFor = (tags: string[] | undefined, field?: string) => {
    const words = [...(tags ?? []), field ?? ""].map((w) => w.toLowerCase());
    return s.areas.find((a) => words.some((w) => w && a.name.toLowerCase().startsWith(w)))?.id ?? "let";
  };
  s.projects = oldProjects.map((p) => ({
    id: p.id, createdAt: p.createdAt ?? nowIso(), updatedAt: p.updatedAt ?? nowIso(), archivedAt: null,
    title: p.title, areaId: areaFor([], p.field), status: p.archived ? "done" : "active", start: null, target: null,
    outcome: (p.content ?? "").split("\n")[0].slice(0, 160), milestones: [],
  }));
  s.tasks = oldTasks.map((t) =>
    makeTask({
      id: t.id,
      createdAt: t.createdAt ?? nowIso(),
      updatedAt: t.updatedAt ?? nowIso(),
      title: t.title,
      notes: t.notes ?? "",
      areaId: areaFor(t.tags ?? ((t as any).category ? [(t as any).category] : [])),
      projectId: t.projectId ?? null,
      status: t.status === "done" ? "done" : t.status === "doing" ? "doing" : "next",
      priority: OLD_PRIORITY[t.priority] ?? 2,
      due: t.due ?? null,
      checklist: (t.subtasks ?? []).map((x) => ({ id: x.id, title: x.title, done: x.done })),
      completedAt: (() => {
        const c = t.completedAt ?? (t.status === "done" ? t.updatedAt : null);
        return c ? localIso(new Date(c)) : t.status === "done" ? nowIso() : null; // v1 stored UTC; v2 keys days by local time
      })(),
      log: [{ at: nowIso(), text: "Migrated from v1" }],
    })
  );
  return s;
}

/** Local preview: a believable week so every screen has something to show. */
export function demoSeed(): HubState {
  const s = emptyState();
  const T = today();
  const d = (n: number) => addDays(T, n);
  s.goals[0].start = 300;

  const P = (title: string, areaId: string, outcome: string, extra: Partial<Project> = {}): Project => ({
    ...base(d(-20)), title, areaId, status: "active", start: d(-20), target: d(30), outcome, milestones: [], ...extra,
  });
  const meta = P("Meta lead campaign", "let", "20 qualified leads at under $8 each by the end of the month.", {
    track: "growth",
    milestones: [
      { id: uid(), title: "Creatives ready", date: d(-6), done: true },
      { id: uid(), title: "Campaign live", date: d(2), done: false },
      { id: uid(), title: "First 10 leads", date: d(14), done: false },
    ],
  });
  const groupE = P("Open Group E", "let", "A fifth group running Tue/Thu with 4 students.", { track: "growth", target: d(45) });
  const curriculum = P("Curriculum v3 refresh", "let", "Every level has slides, a game and a worksheet.", { track: "delivery", target: d(60) });
  const thesis = P("Thesis chapter 2", "studies", "Draft of chapter 2 sent to my tutor.", { target: d(21) });
  const move = P("Move-out plan", "rel", "Shortlist of 3 flats and a budget we both agreed on.", { status: "planned", target: d(120) });
  const kitchen = P("Kitchen setup", "home", "Kitchen fully usable: shelves up, basics bought.", { status: "paused" });
  s.projects = [meta, groupE, curriculum, thesis, move, kitchen];

  const t = (title: string, p: Partial<Task>) => makeTask({ title, createdAt: ts(d(-5)), ...p });
  s.tasks = [
    t("Reply to Mateo's parent about late payment", { priority: 1, due: T, scheduled: T, estimate: 10, studentId: "s-2" }),
    t("Prep Group A: Questions with -ing", { priority: 1, scheduled: T, estimate: 30, groupId: "g-a", projectId: curriculum.id }),
    t("Approve Meta ad creatives", { priority: 1, scheduled: T, estimate: 20, projectId: meta.id, checklist: [{ id: uid(), title: "Carousel", done: true }, { id: uid(), title: "Reel cut", done: false }] }),
    t("Read chapter 4 of methodology book", { areaId: "studies", priority: 2, scheduled: T, estimate: 45, projectId: thesis.id }),
    t("Book dinner for Friday", { areaId: "rel", priority: 2, due: d(1), estimate: 5 }),
    t("Fix the leaking tap", { areaId: "home", priority: 3, due: d(-2), estimate: 30 }),
    t("Set up lead form & audience", { priority: 1, due: d(2), estimate: 30, projectId: meta.id, status: "doing" }),
    t("Write ad copy (3 variants)", { priority: 2, due: d(-1), estimate: 45, projectId: meta.id, status: "done", completedAt: ts(d(-1)) }),
    t("Waiting: Meta template approval", { priority: 2, status: "waiting", waitingOn: "Meta template approval", followUp: d(2), projectId: meta.id }),
    t("Ask Isabella's mum about trial sibling", { priority: 2, status: "waiting", waitingOn: "Parent reply", followUp: d(1), studentId: "s-5" }),
    t("Draft Group E schedule options", { priority: 2, due: d(3), estimate: 30, projectId: groupE.id }),
    t("Post Group E announcement to parents", { priority: 2, due: d(6), estimate: 15, projectId: groupE.id }),
    t("Level 12 worksheet", { priority: 3, due: d(9), estimate: 60, projectId: curriculum.id }),
    t("Chapter 2 outline", { areaId: "studies", priority: 1, due: d(4), estimate: 90, projectId: thesis.id }),
    t("Send sources to tutor", { areaId: "studies", priority: 2, due: d(5), estimate: 15, projectId: thesis.id }),
    t("Shortlist flats on Idealista", { areaId: "rel", priority: 2, due: d(10), estimate: 40, projectId: move.id }),
    t("Weekly gym x3", { areaId: "personal", priority: 3, recurrence: { kind: "weekly", days: [1, 3, 5] }, scheduled: d(1), estimate: 60 }),
    t("Water the plants", { areaId: "home", priority: 3, recurrence: { kind: "after", n: 3 }, scheduled: d(2), estimate: 5 }),
    t("Finish Hollow Knight DLC", { areaId: "hobbies", priority: 3, estimate: 120, status: "next" }),
    // inbox — captured, not organised
    t("idea: referral discount for siblings", { status: "inbox", createdAt: ts(d(-1)) }),
    t("buy HDMI adapter", { status: "inbox", areaId: "home", createdAt: ts(d(-1)) }),
    t("look into Kommo automations", { status: "inbox", createdAt: ts(T) }),
    t("Camila birthday gift?", { status: "inbox", createdAt: ts(T) }),
    // done history (feeds streak + done feed)
    ...[1, 2, 3, 4, 5, 6, 8, 9].flatMap((ago) =>
      [0, 1, 2].map((i) =>
        t(["Lesson prep", "Reply to parents", "Invoice check", "Inbox triage", "Worksheet", "Ad check"][(ago + i) % 6], {
          status: "done", scheduled: d(-ago), completedAt: `${d(-ago)}T1${i + 1}:15:00.000`, priority: ((i % 3) + 1) as Priority, estimate: 20,
        })
      )
    ),
    t("Confirm Group B class time", { status: "done", scheduled: T, completedAt: `${T}T08:40:00.000`, priority: 2, estimate: 5 }),
  ];

  s.goals.push(
    { ...base(), title: "Reach 30 active students", areaId: "let", horizon: "year", metric: "students", target: 30, start: 6, unit: "students", deadline: `${T.slice(0, 4)}-12-31`, pinned: false, log: [] },
    { ...base(), title: "Ship Meta lead campaign", areaId: "let", horizon: "quarter", metric: "tasks", target: 0, start: 0, unit: "tasks", deadline: d(30), pinned: false, projectId: meta.id, log: [] },
    { ...base(), title: "Move-out fund", areaId: "rel", horizon: "year", metric: "manual", target: 6000, start: 0, unit: "$", deadline: d(200), pinned: false, log: [{ date: d(-60), value: 1800 }, { date: d(-30), value: 2400 }, { date: d(-3), value: 2950 }] },
    { ...base(), title: "Finish 4 games this year", areaId: "hobbies", horizon: "year", metric: "collection", target: 4, start: 0, unit: "games", deadline: `${T.slice(0, 4)}-12-31`, pinned: false, log: [] },
    { ...base(), title: "Gym 3× this week", areaId: "personal", horizon: "week", metric: "manual", target: 3, start: 0, unit: "sessions", deadline: addDays(weekStart(T), 6), pinned: false, log: [{ date: d(-1), value: 1 }] },
    { ...base(), title: "Trip to Lisbon", areaId: "rel", horizon: "someday", metric: "manual", target: 0, start: 0, unit: "", deadline: null, pinned: false, log: [], timeframe: "Spring", budget: 900, planStatus: "saving" },
    { ...base(), title: "Teach a summer camp", areaId: "let", horizon: "someday", metric: "manual", target: 0, start: 0, unit: "", deadline: null, pinned: false, log: [], timeframe: "Next summer", budget: null, planStatus: "idea" },
    { ...base(), title: "Home office setup", areaId: "home", horizon: "someday", metric: "manual", target: 0, start: 0, unit: "", deadline: null, pinned: false, log: [], timeframe: "Q1", budget: 600, planStatus: "idea" },
  );
  const games = s.collections.find((c) => c.name === "Games backlog")!;
  s.goals.find((g) => g.metric === "collection")!.collectionId = games.id;

  const N = (title: string, body: string, p: Partial<Note>): Note => ({ ...base(), title, body, type: "doc", areaId: "let", pinned: false, ...p });
  s.notes = [
    N("Pricing & discounts", "## Plan Completo\n- $50 / month, 3 classes a week\n- Sibling discount: **$40**\n\n## Rules\n1. Discounts only for siblings\n2. Returning alumni: first month $40", { pinned: true }),
    N("Parent message templates", "**Late payment**\n> Hi! Just a friendly reminder that this month's payment is pending…\n\n**Welcome**\n> Welcome to LET Junior! 🎉", { type: "reference", pinned: true }),
    N("Meta campaign brief", "Audience: parents 28–45, LATAM. Objective: leads. Budget $8/day.", { projectId: meta.id, type: "plan" }),
    N("Thesis notes (Obsidian)", "Long-form thinking lives in Obsidian.", { areaId: "studies", type: "reference", link: "obsidian://open?vault=Brain&file=Thesis%2FChapter%202" }),
    N("Weekly sync with Ana", "- Budget for flat\n- Lisbon dates", { areaId: "rel", type: "meeting" }),
  ];

  const I = (c: Collection, title: string, values: Record<string, unknown>, extra: Partial<Item> = {}): Item => ({ ...base(), collectionId: c.id, title, values, doneAt: null, ...extra });
  const byName = (n: string) => s.collections.find((c) => c.name === n)!;
  const obj = byName("In-game objectives");
  const wish = byName("Wishlist");
  const books = byName("Books & media");
  const places = byName("Places to visit");
  const dates = byName("Important dates");
  s.items = [
    I(games, "Elden Ring", { platform: "PS5", status: "Playing", hours: 64, rating: 10 }),
    I(games, "Hollow Knight", { platform: "Switch", status: "Finished", hours: 41, rating: 9 }, { doneAt: ts(d(-40)) }),
    I(games, "Hades II", { platform: "PC", status: "Backlog" }),
    I(games, "Balatro", { platform: "Steam Deck", status: "Finished", hours: 30, rating: 8 }, { doneAt: ts(d(-90)) }),
    I(games, "Zelda: Tears of the Kingdom", { platform: "Switch", status: "Backlog" }),
    I(obj, "Kill Malenia", { game: "Elden Ring", location: "Haligtree", done: false }),
    I(obj, "All Pale Ore", { game: "Hollow Knight", location: "Various", done: true }, { doneAt: ts(d(-45)) }),
    I(wish, "Mechanical keyboard", { price: 120, priority: "Want", url: "" }),
    I(wish, "Noise-cancelling headphones", { price: 250, priority: "Must", url: "" }),
    I(books, "Teach Like a Champion", { kind: "Book", status: "In progress" }),
    I(books, "Severance S2", { kind: "Series", status: "Queued" }),
    I(places, "Lisbon", { city: "Lisbon", budget: 900, visited: false }),
    I(places, "Cartagena", { city: "Cartagena", budget: 700, visited: true }, { doneAt: ts(d(-200)) }),
    I(dates, "Ana's birthday", { date: d(9), remind: 7, kind: "Birthday" }),
    I(dates, "Anniversary", { date: d(48), remind: 14, kind: "Anniversary" }),
    I(dates, "Domain renewal", { date: d(4), remind: 5, kind: "Renewal" }),
  ];

  s.groupMeta = {
    "g-a": { capacity: 4, slots: [1, 3, 5].map((day) => ({ day, start: "17:00", minutes: 60 })) },
    "g-b": { capacity: 4, slots: [1, 3, 5].map((day) => ({ day, start: "18:15", minutes: 60 })) },
    "g-c": { capacity: 4, slots: [2, 4, 6].map((day) => ({ day, start: "16:00", minutes: 60 })) },
    "g-d": { capacity: 4, slots: [2, 4, 0].map((day) => ({ day, start: "10:00", minutes: 60 })) },
  };
  s.adSpend = {};

  // Lesson logs for every past class (today's are left for the owner to log).
  const roster: Record<string, string[]> = { "g-a": ["s-1", "s-2", "s-3", "s-4"], "g-b": ["s-5", "s-6", "s-7"], "g-c": ["s-8", "s-9", "s-10"], "g-d": ["s-11", "s-12"] };
  const topics: Record<string, string> = { "g-a": "Questions with -ing", "g-b": "Basic Questions", "g-c": "Regular/Irregular Verbs", "g-d": "Colors and Objects" };
  for (let ago = 1; ago <= 28; ago++) {
    const day = d(-ago);
    const dow = new Date(day + "T12:00:00").getDay();
    for (const [gid, gm] of Object.entries(s.groupMeta)) {
      if (!gm.slots?.some((x) => x.day === dow)) continue;
      s.lessons.push({ ...base(day), date: day, groupId: gid, topic: topics[gid], notes: "", attendance: Object.fromEntries(roster[gid].map((id, i) => [id, (ago + i) % 9 !== 0])) });
    }
  }

  // Timer history this week
  const TE = (dayOff: number, h: number, mins: number, label: string, areaId: string, track?: "delivery" | "growth", projectId?: string): TimeEntry => ({
    ...base(d(dayOff)), start: `${d(dayOff)}T${String(h).padStart(2, "0")}:00:00`, end: localIso(new Date(Date.parse(`${d(dayOff)}T${String(h).padStart(2, "0")}:00:00`) + mins * 60000)), areaId, source: "timer", track, label, projectId,
  });
  s.time = [
    TE(-1, 9, 50, "Meta creatives", "let", "growth", meta.id),
    TE(-2, 10, 40, "Lesson prep", "let", "delivery", curriculum.id),
    TE(-2, 15, 90, "Thesis reading", "studies"),
    TE(-3, 9, 30, "Parent follow-ups", "let", "growth"),
    TE(-3, 11, 60, "Worksheet", "let", "delivery", curriculum.id),
    TE(-4, 20, 45, "Elden Ring", "hobbies"),
    TE(0, 8, 25, "Inbox & admin", "let", "growth"),
  ];

  // Game history: ~8 weeks of XP so the player sits around level 12
  const xp: XpEvent[] = [];
  for (let ago = 56; ago >= 1; ago--) {
    const day = d(-ago);
    const areas = ["let", "let", "let", "studies", "hobbies", "personal", "rel", "home"];
    for (let i = 0; i < 4; i++) {
      const areaId = areas[(ago + i) % areas.length];
      xp.push({ id: uid(), at: `${day}T1${i}:00:00.000`, amount: [40, 20, 30, 10][(ago + i) % 4] + (ago % 5) * 6, areaId, label: "Task", source: "task" });
    }
    if (ago % 7 === 0) xp.push({ id: uid(), at: `${day}T19:00:00.000`, amount: 150, areaId: null, label: "Weekly review", source: "review" });
  }
  xp.push({ id: uid(), at: `${d(-30)}T12:00:00.000`, amount: 500, areaId: "let", label: "New paying student", source: "student" });
  xp.push({ id: uid(), at: `${T}T08:41:00.000`, amount: 20, areaId: "let", label: "Confirm Group B class time", source: "task" });
  s.game.xp = xp;
  for (const ago of [1, 2, 3, 4, 5, 6, 8, 9]) s.game.dayPlans[d(-ago)] = { at: `${d(-ago)}T08:30:00`, taskIds: [] };
  s.game.inboxZeroDays = [d(-2), d(-5), d(-9), d(-12)];
  s.game.unlocked = { "first-blood": ts(d(-56)), completionist: ts(d(-40)) };
  s.reviews = [{ id: uid(), week: weekStart(d(-7)), doneAt: ts(d(-1)), priorities: [], notes: "" }];
  return s;
}

export const freshState = emptyState;
