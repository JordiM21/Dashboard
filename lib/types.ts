/**
 * Firestore `projects` document shape — the OPTIONAL parent a task can
 * belong to. A project is a container and a label, nothing more: its
 * progress is derived from its tasks (see lib/tasks.ts's projectProgress),
 * never stored, so ticking a task off is the only way progress ever moves.
 *
 * Older docs (from the kanban this replaced) still carry status/priority/
 * progress fields — they are simply ignored on read, so no migration was
 * needed.
 */
export interface Project {
  id: string;
  title: string;
  icon?: string; // single emoji chosen by the user
  field: string; // category label, shared vocabulary with Task.category
  archived: boolean; // finished/shelved — hidden from the rail, its tasks still searchable
  content: string; // free-text notes
  createdAt?: string;
  updatedAt?: string;
}

/** One checklist line inside a Task. Ids are generated client-side (crypto.randomUUID) — Firestore only ever sees the whole array. */
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";

/**
 * Firestore `tasks` document shape — the unit of work everything else in
 * this app's to-do flow is built on. `due` is a plain local calendar date
 * ("YYYY-MM-DD", same convention as Student.nextPayment), null when the
 * task is a someday/backlog item with no commitment attached.
 *
 * `status` is deliberately three-valued rather than a kanban column: at
 * night you mark what's done, what's still in flight ("doing"), and what
 * you're starting tomorrow (todo + due = tomorrow). That's the entire
 * ritual, and it's the reason "doing" survives across days instead of
 * being reset.
 */
export interface Task {
  id: string;
  title: string;
  notes: string;
  // Free-text labels, typed as "#marketing" in the capture box or picked
  // from the tags already in use. Older docs carry a single `category`
  // string instead; lib/useTaskStore.ts folds that into this array on read,
  // so nothing had to be migrated.
  tags: string[];
  priority: TaskPriority;
  status: TaskStatus;
  due: string | null;
  projectId: string | null; // optional parent — a task never has to belong to a project
  subtasks: Subtask[];
  completedAt?: string | null; // ISO timestamp of the tick that set status to "done"
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Firestore `students` document shape. `name` and `status` are the only
 * fields guaranteed present — everything else is optional because a lead
 * created by `metaLeadReceiver` starts with just a name and contact info,
 * and gets enriched (class group, schedule, tuition...) manually afterward.
 *
 * `contact` is legacy — `metaLeadReceiver` still writes it (a lead's own
 * phone/email, which predates `parentEmail`), but the Students UI no longer
 * shows or edits it, since `parentEmail` supersedes it for a student the
 * dashboard actually manages (see README "Connecting a student to their
 * parent's payments"). Kept optional, not removed, so existing/webhook-
 * created records don't break.
 */
export interface Student {
  id: string;
  name: string;
  contact?: string;
  status: "active" | "inactive";
  classGroup?: string;
  schedule?: string;
  parentConnected?: boolean;
  tuition?: number;
  // The student's due date — a fixed monthly schedule, not tied to when a
  // payment actually lands. See lib/studentStatus.ts for how this becomes
  // Up to Date / Pending / Late, and lib/firebase/db.ts's
  // applyPaymentToStudent() for how it advances by exactly one month
  // whenever a matching payment is recorded.
  nextPayment?: string;
  // The parent's email — matched against a transaction's payerEmail so
  // automated payments (Stripe webhook, recurring cron) can find the right
  // student without a human manually picking one. See README "Connecting a
  // student to their parent's payments".
  parentEmail?: string;
  plan?: "Main Course" | "Initial Demo";
  photoUrl?: string; // profile picture — a URL or path, same convention as ResourceFile.storagePath
  notes?: string; // free-text — "things to remember" about this student/parent
  tags?: string[];
  source?: string; // e.g. "meta_lead_ad" when created by a webhook
  createdAt?: string;
  updatedAt?: string;
}

/** Firestore `transactions` document shape — one signed ledger entry. */
export interface FinanceEntry {
  id: string;
  date: string;
  description: string;
  category: string;
  type: "Income" | "Expense";
  // Always USD, always what you sum/compare across the whole ledger. For a
  // Stripe transaction this is Stripe's own converted settlement amount
  // (from the charge's balance_transaction, using Stripe's real exchange
  // rate) — not a rate we compute or maintain ourselves.
  amount: number; // signed: positive for income, negative for expense, USD
  // The true amount actually charged, in its original currency — kept for
  // transparency/audit. Absent when the charge was already in USD (no
  // conversion happened) or for a manual entry with no original-currency
  // info recorded.
  originalAmount?: number;
  originalCurrency?: string; // lowercase ISO 4217 code, Stripe's own convention (e.g. "cop", "bob")
  exchangeRate?: number; // originalCurrency -> USD, from Stripe's balance_transaction.exchange_rate
  studentId?: string | null; // not every transaction is tied to a student (e.g. ad spend)
  // Optional (not required) because Firestore doesn't enforce schema — a
  // document added by hand in the console could lack it. Always set
  // explicitly by our own writers: "manual" from app/api/finance/route.ts
  // (server-enforced, ignores any client-supplied value), "stripe" from
  // functions/src/paymentReceiver.ts, "recurring" from
  // app/api/cron/recurring-payments/route.ts.
  source?: "manual" | "stripe" | "recurring";
  stripePaymentId?: string; // Stripe PaymentIntent or Checkout Session id — only set when source is "stripe"
  recurringTransactionId?: string; // id of the RecurringTransaction template that generated this entry
  // The payer's email, when known (Stripe's customer_details.email, or typed
  // in manually) — matched against Student.parentEmail by
  // applyPaymentToStudent() to auto-advance that student's due date.
  payerEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  byCategory: { category: string; net: number }[];
}

/**
 * Firestore `recurringTransactions` document shape — a subscription/recurring
 * bill template (SaaS tools, ad spend, etc). `scripts`-free automation: the
 * `/api/cron/recurring-payments` route (Vercel Cron, daily) finds every doc
 * where `active` and `nextPayment <= today`, creates a real `transactions`
 * entry dated `nextPayment`, then advances `lastPayment`/`nextPayment` by
 * `frequencyMonths`. Manual "Run now" in the UI hits the same route.
 *
 * Can also be created retroactively — "I already paid this on 19 Aug, next
 * one's due 19 Feb" — see `components/AddRecurringModal.tsx`'s "already
 * paid" option and `app/api/finance/recurring/route.ts`'s `paidOn` handling,
 * which both logs the real transaction dated in the past AND sets
 * `lastPayment`/`nextPayment` accordingly, instead of waiting for the cron.
 */
export interface RecurringTransaction {
  id: string;
  description: string;
  category: string;
  type: "Income" | "Expense";
  amount: number; // always positive — sign is applied when the real transaction is generated
  active: boolean;
  lastPayment: string | null; // ISO date of the most recent auto-generated transaction, null if never triggered
  nextPayment: string; // ISO date — when the next transaction will be auto-generated
  frequencyMonths: number; // how many months between payments — 1 for monthly, 6 for semi-annual, 12 for yearly, etc.
  studentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** One resolved Kommo pipeline stage, used to label a lead's status_id. */
export interface KommoStatus {
  id: number;
  name: string;
  color?: string;
}

/** One Kommo pipeline with its ordered stages. */
export interface KommoPipeline {
  id: number;
  name: string;
  statuses: KommoStatus[];
}

/** A Kommo lead enriched with resolved pipeline/status names and tags — see lib/api/kommo.ts. */
export interface KommoLeadDetailed {
  id: string;
  name: string;
  price: number;
  pipelineId: number;
  pipelineName: string;
  statusId: number;
  statusName: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** One ad campaign with its rolled-up insights for the selected date range — powers the Meta view's Campaigns tab. */
/**
 * Which ad account the campaign numbers actually came from.
 *
 * Returned alongside the campaigns so the UI can tell "this account has
 * never run a campaign" apart from "nothing ran in the selected period" —
 * the two look identical from an empty array, and conflating them hides a
 * real misconfiguration (pointing META_AD_ACCOUNT_ID at an account that
 * isn't the one the ads are actually running on) behind a shrug of a
 * message about picking a wider date range.
 */
export interface MetaAdAccountInfo {
  id: string; // "act_1234567890"
  name: string;
  /**
   * The account's own currency (ISO 4217, e.g. "USD", "VES"). Every ad
   * money figure Meta returns is denominated in this, NOT in dollars —
   * hardcoding "$" mislabels the numbers on any non-USD account.
   */
  currency: string;
  /** Lifetime spend on the account, in `currency`. Zero on an account that has never run an ad. */
  amountSpent: number;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string; // ACTIVE, PAUSED, ARCHIVED, etc — Meta's own campaign status string
  objective: string;
  dailyBudgetUsd: number | null;
  lifetimeBudgetUsd: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number; // %
  cpc: number; // USD per click
  leads: number;
}

/** One published Facebook or Instagram post with its engagement metrics — powers the Meta view's Posts tab. */
export interface MetaPost {
  id: string;
  platform: "facebook" | "instagram";
  message: string;
  permalink: string;
  mediaUrl?: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  impressions: number;
  reach: number;
  engagementRate: number; // % — (likes+comments+shares)/reach, 0 when reach is 0
  // Facebook stopped exposing per-post reach/impressions via the Graph API
  // (Meta deprecated post_impressions/post_impressions_unique/post_reach —
  // see lib/api/metaContent.ts's fetchFacebookPostInsights) — reach/
  // engagementRate are always 0 for a "facebook" post, not a real
  // measurement. Only "instagram" posts have this be a real number.
  reachAvailable: boolean;
}

/** Account-level snapshot — Page/IG follower counts, used for the Meta view's growth KPI. */
export interface MetaAudienceSnapshot {
  facebookFans: number | null;
  instagramFollowers: number | null;
}

/**
 * Firestore `metaAudienceSnapshots` document shape — one per calendar day,
 * doc id is the date itself ("YYYY-MM-DD") so a re-run the same day
 * overwrites rather than duplicates. Captured daily by
 * app/api/cron/meta-audience-snapshot.
 *
 * Why this exists despite lib/api/meta.ts already being able to fetch live
 * follower history: Facebook's `page_follows` insight goes back ~90 days
 * live, but Instagram's `follower_count` is hard-capped at the trailing 30
 * days by the platform itself (confirmed — every request further back
 * fails with "(#100) metric only supports querying data for the last 30
 * days", not a permissions issue). This collection is what lets an
 * Instagram month-over-month comparison stay accurate once it's more than
 * 30 days in the past — see lib/api/metaGrowth.ts.
 */
export interface MetaAudienceSnapshotRecord {
  id: string; // "YYYY-MM-DD"
  date: string; // same as id, kept as a field too for query convenience
  facebookFollowers: number | null;
  instagramFollowers: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** One comparable metric for a period vs the immediately preceding period of the same length — powers the Meta view's Overview growth cards. */
export interface PeriodComparison {
  current: number;
  previous: number;
  /** True when `previous` (or part of `current`) couldn't be fully measured — e.g. Instagram follower history older than 30 days with no stored snapshot yet for that date. Shown as "partial" in the UI rather than a misleadingly precise number. */
  partial: boolean;
}

/** Growth summary for one platform over the selected period — powers Overview's "Interactions by Platform" section. */
export interface PlatformGrowth {
  platform: "facebook" | "instagram";
  posts: PeriodComparison;
  interactions: PeriodComparison; // likes + comments (+ shares for Facebook)
  followers: PeriodComparison; // net new followers over the period, not a running total
}

export interface ResourceFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export interface ResourceFile {
  id: string;
  title: string;
  description: string;
  tags: string[];
  folderId: string | null;
  originalName: string;
  storagePath: string; // Firebase Storage object path, e.g. "resources/{id}/{originalName}"
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourcesManifest {
  folders: ResourceFolder[];
  files: ResourceFile[];
}

// ---------------------------------------------------------------------------
// Curriculum Board — curriculum, groups,
// groups/{id}/history, and weeklyPlans all live directly in Firestore now,
// in place of curriculum-20-levels.md, group-history.md, and the local
// .excalidraw folder tree scripts/generate-week.ts used to generate. See
// lib/firebase/curriculumBoard.ts.
// ---------------------------------------------------------------------------

/** Firestore `curriculum` document shape — one of the 20 levels, directly editable in Firestore instead of parsed out of curriculum-20-levels.md. */
export interface CurriculumLevelDoc {
  id: string; // doc id, e.g. "level-6"
  levelNumber: number;
  stageName: string; // e.g. "Foundation Stage: The Basics"
  title: string; // e.g. "Right Now"
  subtopics: string[];
  emoji: string;
  // A custom color override for this level's card/badge — null (the
  // default) means "use the stage's auto-cycled color", same as every
  // level did before this field existed.
  color: string | null;
}

/** Firestore `groups` document shape — a teaching group's current place in the curriculum. Moved by dragging its pill onto a level/subtopic on the Curriculum Board, which just PATCHes currentLevel/currentTopic. */
export interface GroupDoc {
  id: string;
  name: string; // "Group A"
  currentLevel: number;
  currentTopic: string;
}

/** `GroupDoc` plus a client-computed flag — never stored, added by GET /api/board/groups from the group's history sub-collection. See lib/firebase/curriculumBoard.ts's isRecallDue. */
export interface GroupDocWithRecall extends GroupDoc {
  reviewSuggested: boolean;
}

/**
 * Firestore `groups/{groupId}/history` sub-collection document shape — one
 * entry per completed lesson. Source of truth for the "Generate Parent
 * Report" button (last 30 days) and the 90-Day Recall badge (a "Mastered"
 * entry 90+ days old with nothing more recent surfaces "Review Suggested"
 * on that group's progress card).
 */
export interface GroupHistoryEntry {
  id: string;
  date: string; // ISO date the lesson happened
  topic: string;
  status: "Mastered" | "Review Pending";
  teacherNotes: string;
}

/**
 * One saved link on a lesson — a YouTube video, a flashcard site, an image,
 * a Google Doc, or the `/api/resources/files/{id}/raw` URL of something
 * already in the Resources library. Deliberately just a URL plus a label:
 * whiteboards now live in local Excalidraw files opened straight from the
 * browser, so a lesson's job is to point at material, not to host it.
 */
export interface LessonLink {
  id: string;
  url: string;
  title: string;
}

/**
 * Firestore `weeklyPlans` document shape — one lesson, from planned to
 * taught. Created against a group and a syllabus topic, filled in with links
 * and a plan while preparing, then closed out with takeaways and a
 * Mastered / Review Pending verdict — which writes the matching
 * `groups/{groupId}/history` entry and records its id here
 * (`historyEntryId`, "" while the lesson is still only a plan).
 *
 * The embedded Excalidraw board this used to carry (`excalidrawPath`) is
 * gone: boards are local .excalidraw files now, linked like any other
 * material. Existing docs keep the dead field, nothing reads it.
 */
export interface WeeklyPlanDoc {
  id: string;
  groupId: string;
  date: string; // ISO date
  topic: string;
  teacherNotes: string; // the plan — what to run, in what order
  takeaways: string; // written after the lesson: what actually mattered
  links: LessonLink[];
  historyEntryId: string; // "" until the lesson is marked taught
  emojis: string[];
  // A sparse ordering key, not an array index, so reordering one lesson
  // never requires rewriting every other doc.
  order?: number;
  // Which `weeklyPlanTags` doc ids this lesson carries — always an array
  // (never undefined) so Firestore writes never special-case a missing field.
  tagIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Firestore `weeklyPlanTags` document shape — a reusable tag a weekly plan can carry. Created once via the tag picker's "+ new tag", then attached to plans by id (WeeklyPlanDoc.tagIds) — never freeform text. */
export interface WeeklyPlanTagDoc {
  id: string;
  name: string;
  color: string;
}
