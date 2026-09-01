/** Firestore `projects` document shape. */
export interface Project {
  id: string;
  title: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  field: string;
  status: "To Do" | "In Progress" | "Paused" | "Done";
  progress: number; // 0-100
  icon?: string; // single emoji chosen by the user
  content: string; // free-text notes
  createdAt?: string;
  updatedAt?: string;
}

/** Firestore `content` document shape. */
export interface ContentItem {
  id: string;
  title: string;
  cover: string; // path or URL to cover image
  tags?: string[];
  publishedAt?: string;
  content: string; // markdown body
  createdAt?: string;
  updatedAt?: string;
}

/** Firestore `agents` document shape — read-only in the UI, seeded via scripts/migrateMarkdownToFirebase.ts. */
export interface AgentDoc {
  id: string;
  name: string;
  role: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  schedule: string; // cron or human readable
  status: "active" | "paused" | "error";
  summary: string;
  content: string;
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
  photoUrl?: string; // profile picture — a URL/path, same convention as ContentItem.cover
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
  /** Lifetime spend on the account, USD. Zero on an account that has never run an ad. */
  amountSpentUsd: number;
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

/** Firestore `lessons` document shape. */
export interface Lesson {
  id: string;
  date: string;
  topic: string;
  studentId: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  createdAt?: string;
  updatedAt?: string;
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
 * Firestore `weeklyPlans` document shape — one manually-created lesson plan,
 * replacing the folder-scanning of /lessons/[group]/week-[date]/ that
 * scripts/generate-week.ts used to produce. `excalidrawPath` still points at
 * a local .excalidraw file (created blank by the "New Lesson" modal) — only
 * the plan's metadata and scheduling move into Firestore.
 */
export interface WeeklyPlanDoc {
  id: string;
  groupId: string;
  date: string; // ISO date
  topic: string;
  excalidrawPath: string;
  teacherNotes: string;
  emojis: string[];
  // The sidebar's "Weekly Plans" queue is drag-reorderable (Phase 3) — a
  // sparse ordering key, not an array index, so reordering one plan never
  // requires rewriting every other doc.
  order?: number;
  // Which `weeklyPlanFolders` doc this plan is filed under — "" (not
  // undefined) means unfiled, so every doc always has a plain string here
  // and Firestore writes never need to special-case a missing field.
  folderId: string;
  // Which `weeklyPlanTags` doc ids this plan carries — always an array
  // (never undefined), same "no missing field" convention as folderId.
  tagIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Firestore `weeklyPlanFolders` document shape — a folder in the Teaching sidebar's "Weekly Plans" queue. Nestable (parentId, Obsidian-vault-style tree) and colorable (preset palette or a custom hex, null = default neutral). */
export interface WeeklyPlanFolderDoc {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  color: string | null;
}

/** Firestore `weeklyPlanTags` document shape — a reusable tag a weekly plan can carry. Created once via the tag picker's "+ new tag", then attached to plans by id (WeeklyPlanDoc.tagIds) — never freeform text. */
export interface WeeklyPlanTagDoc {
  id: string;
  name: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Games — interactive classroom activities. One `GameDoc` per game, in the
// `games` Firestore collection. Only the field matching `type` is populated;
// a flat optional field per type (rather than a generic `data: unknown` or a
// discriminated union) keeps every game's shape simple and directly typed
// without cast gymnastics, matching the existing flat-optional-field
// convention (e.g. GameDoc.memoryCards).
// ---------------------------------------------------------------------------

export type GameType =
  | "memory-cards"
  | "fill-in-the-gaps"
  | "match-word-image"
  | "hangman"
  | "sort-categories"
  | "spelling-bee";

/** One Memory Cards item — duplicated into two face-down cards at play time. */
export interface MemoryCardsItem {
  id: string;
  kind: "text" | "image";
  value: string; // text to show, or an image URL/path
}
export interface MemoryCardsData {
  items: MemoryCardsItem[];
}

/** One Fill in the Gaps sentence — `text` contains "___" as the blank marker. */
export interface FillGapsSentence {
  id: string;
  text: string;
  answer: string;
}
export interface FillGapsData {
  sentences: FillGapsSentence[]; // word bank at play time = shuffled list of every sentence's answer
}

/** One Match Word ↔ Image pair. */
export interface MatchPair {
  id: string;
  word: string;
  image: string; // URL/path
}
export interface MatchWordImageData {
  pairs: MatchPair[];
}

/** One Hangman word, played in list order. */
export interface HangmanWord {
  id: string;
  word: string;
  hint?: string;
}
export interface HangmanData {
  words: HangmanWord[];
}

/** One bin a Sort into Categories item can be dragged into. */
export interface SortCategory {
  id: string;
  name: string;
}
/** One sortable item — kind mirrors MemoryCardsItem (text or image), plus which category it belongs to. */
export interface SortItem {
  id: string;
  kind: "text" | "image";
  value: string;
  categoryId: string;
}
export interface SortCategoriesData {
  categories: SortCategory[];
  items: SortItem[]; // word bank at play time = every item, shuffled
}

/**
 * One Spelling Bee word. `audioUrl` points at `/api/games/{gameId}/audio/{wordId}`
 * (a signed-URL redirect over Firebase Storage — see that route) once a clip
 * has been recorded or uploaded; absent until then, in which case the
 * player just skips the "play sound" step.
 */
export interface SpellingWord {
  id: string;
  word: string;
  hint?: string;
  audioUrl?: string;
}
export interface SpellingBeeData {
  words: SpellingWord[];
}

/** Firestore `games` document shape. */
export interface GameDoc {
  id: string;
  type: GameType;
  title: string;
  description: string;
  tags: string[];
  cover: string; // URL/path, same convention as ContentItem.cover
  memoryCards?: MemoryCardsData;
  fillGaps?: FillGapsData;
  matchWordImage?: MatchWordImageData;
  hangman?: HangmanData;
  sortCategories?: SortCategoriesData;
  spellingBee?: SpellingBeeData;
  createdAt?: string;
  updatedAt?: string;
}

