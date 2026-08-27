# My Dashboard

A Next.js dashboard for running a small language-school business: a single
company-wide **Overview** (KPIs, cash flow, channel performance, students,
projects — all in one place), a dedicated **Kommo pipeline view**, a student
roster, an income/expense ledger with recurring/subscription payments, an
internal project board, a Firebase-backed file manager, a content library,
and a directory of scheduled AI agents.

There used to be a separate "Manager" page for channel KPIs (Stripe/Kommo/
Meta/Gmail) alongside Overview — it was folded into Overview's "Channel
KPIs" section since the two were redundant; there is now exactly one
dashboard, not two.

**Backend migration complete**: every page is now backed by Firestore (and,
for Resources, Firebase Storage for the raw file bytes) with real-time
`onSnapshot` updates, in-app forms, and Cloud Functions webhooks so Meta
lead-gen forms and a payment gateway can write directly into the dashboard
(no more manual spreadsheet entry, no Zapier/Make, no local-disk-only data).
See "Firebase migration status" below for details, and "Data on a deployed
/ mobile build" further down for why this mattered — every collection that
used to live on local disk (Resources, Projects, Content, Agents) would
silently break or lose data once actually deployed, not just when accessed
from a phone.

## Folder structure

```
My Dashboard/
├── app/
│   ├── layout.tsx            # wraps everything in AuthProvider + AppShell
│   ├── globals.css           # design system (cream/cake, rounded, floating tabs)
│   ├── page.tsx               # redirects to /overview
│   ├── login/page.tsx         # email/password sign-in (only page not behind the auth gate)
│   ├── overview/page.tsx      # THE dashboard: Finance/Students/Projects/channel KPIs, all real data
│   ├── kommo/page.tsx         # dedicated Kommo pipeline view — every lead, stage, tag, date filter
│   ├── students/page.tsx      # student roster, backed by Firestore
│   ├── finance/page.tsx       # income/expense ledger + recurring payments, backed by Firestore
│   ├── projects/page.tsx      # project kanban/list, backed by Firestore, drag-and-drop status
│   ├── resources/page.tsx     # file manager: folders, images, video, docs (Firebase, CRUD)
│   ├── content/page.tsx       # content grid/library, backed by Firestore
│   ├── agents/page.tsx        # agent directory, backed by Firestore, read-only
│   └── api/
│       ├── kpis/route.ts              # aggregates Stripe/Kommo/Meta/Gmail — consumed by Overview
│       ├── kommo/route.ts             # full Kommo leads + pipelines pull — consumed by /kommo
│       ├── stripe/balance/route.ts    # live Stripe balance + last payout — consumed by Overview
│       ├── cron/recurring-payments/   # auto-triggers due recurring payments (Vercel Cron + manual)
│       ├── students/route.ts          # GET + POST, via lib/firebase/db.ts (admin SDK)
│       ├── finance/route.ts           # GET (+ computed summary) + POST, same pattern
│       ├── finance/recurring/...      # recurring payment template CRUD (requireAuth)
│       ├── projects/...               # GET (public) + POST/PUT/DELETE (requireAuth), same pattern
│       ├── resources/...              # folder + file CRUD, upload, signed-URL file serving
│       └── content/...                # GET (public) + POST/PUT/DELETE (requireAuth), same pattern
├── components/                # FloatingNav, Modal, LiveBadge, KpiCard, ViewToggle, StateBox,
│                               # ErrorBoundary, ResourceDetailModal, AddStudentModal,
│                               # AddTransactionModal, AddRecurringModal, AppShell
├── lib/
│   ├── resources.ts            # Firestore + Storage CRUD for Resources (admin SDK)
│   ├── resourceUtils.ts        # client-safe file-type/size helpers for Resources
│   ├── firebase/
│   │   ├── client.ts                    # client SDK init (NEXT_PUBLIC_* config)
│   │   ├── admin.ts                     # firebase-admin init (service account) — Route Handlers
│   │   ├── db.ts                         # Firestore CRUD: students / transactions / lessons /
│   │   │                                 # projects / content / agents / recurringTransactions
│   │   ├── useFirestoreCollection.ts    # reusable onSnapshot hook (client-side, read-only)
│   │   ├── AuthContext.tsx              # onAuthStateChanged -> { user, loading } via useAuth()
│   │   ├── authFetch.ts                  # fetch() wrapper that attaches the Firebase ID token
│   │   └── verifyAuth.ts                 # server-side ID token verification for Route Handlers
│   ├── finance.ts               # pure summarizeFinance() — totals + category breakdown
│   ├── types.ts                # shared type definitions
│   └── api/
│       └── stripe.ts, kommo.ts, meta.ts, gmail.ts   # channel integrations (all four call the real API when configured, dummy fallback otherwise)
├── functions/                  # Cloud Functions — separate Node subproject
│   ├── package.json            # firebase-admin, firebase-functions, own build step
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # exports both functions below
│       ├── metaLeadReceiver.ts  # Meta Lead Ads webhook -> students
│       ├── paymentReceiver.ts   # Stripe-shaped payment webhook -> transactions
│       └── verifySignature.ts   # shared HMAC signature verification helper
├── firebase.json                # Firebase project config (functions + firestore + storage)
├── .firebaserc                  # project alias — REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID
├── firestore.rules              # Firestore security rules — see the warning inside the file
├── firestore.indexes.json
├── storage.rules                # Firebase Storage security rules (Resources file bytes)
├── vercel.json                  # Vercel Cron schedule for recurring payments
├── scripts/
│   ├── backfillStripeTransactions.ts   # one-time local backfill — npm run backfill:stripe
│   ├── migrateResourcesToFirebase.ts   # one-time local->Firebase migration — npm run migrate:resources
│   └── migrateMarkdownToFirebase.ts    # one-time local->Firebase migration — npm run migrate:markdown
├── data/                        # migration SOURCE ONLY — the app no longer reads these at runtime
│   ├── projects/*.md
│   ├── content/*.md
│   └── agents/*.md
└── public/covers/               # placeholder cover images for Content
```

## Firebase migration status

This is being migrated in phases:

| Phase | What | Status |
|---|---|---|
| 1 | Remove Google Sheets integration code | ✅ Done |
| 2 | Firebase SDK setup (client + admin + `functions/` scaffold) | ✅ Done |
| 3 | Firestore CRUD service for `students` / `transactions` / `lessons` | ✅ Done |
| 4 | Cloud Functions webhooks (`metaLeadReceiver`, `paymentReceiver`) | ✅ Written, not deployed — see "Deploying to production" |
| 5 | `onSnapshot` real-time updates + in-app Add forms | ✅ Done |
| 6 | Firebase Authentication (login, route protection, locked-down rules) | ✅ Written — **rules not yet deployed, see below** |
| 7 | Resources moved from local disk to Firestore + Storage | ✅ Done — see "Data on a deployed / mobile build" |
| 8 | Projects / Content / Agents moved from local markdown files to Firestore | ✅ Done — same section |
| 9 | Manager page folded into Overview (was a redundant second dashboard) | ✅ Done |

**Reads** — `/students` and `/finance` subscribe directly to Firestore from
the browser via `lib/firebase/useFirestoreCollection.ts` (client SDK,
`onSnapshot`). No polling: a webhook write, a Firebase console edit, or an
in-app "Add" all appear in the UI within roughly one network round-trip,
with zero manual refresh. The `LiveBadge` under each page header shows
connection status and when the last snapshot arrived.

**Writes** — go through `app/api/students/route.ts` / `app/api/finance/route.ts`
(`POST`), which use `lib/firebase/db.ts`'s admin-SDK functions rather than
the client SDK. The "Add Student" / "Add Transaction" modals call these
routes via `authFetch()` (attaches the signed-in user's ID token); once
Firestore confirms the write, the already-subscribed `onSnapshot` listener
picks it up automatically, so the modals don't need to manually update any
local list state.

## Authentication

Single-admin, email/password only — there is no self-serve sign-up
anywhere in this app. You create the one account manually in the Firebase
console (Authentication → Users → Add user); anyone without those exact
credentials can't get in.

- **`lib/firebase/AuthContext.tsx`** — `AuthProvider` wraps the whole app in
  `app/layout.tsx` and exposes `useAuth() -> { user, loading }` via
  `onAuthStateChanged`. `loading` is only true during the initial
  session check, not a per-request flag.
- **`app/login/page.tsx`** — email/password form using
  `signInWithEmailAndPassword`. Reuses the existing `.card`/`.form-row`/`.btn`
  design-system classes rather than introducing new ones.
- **`components/AppShell.tsx`** — the route gate, mounted once in
  `app/layout.tsx` around every page. No `user` and not on `/login` →
  redirect to `/login`. Signed in and on `/login` → redirect to `/overview`.
  Renders a loading state (not protected content, not a stale login form)
  during the brief window before either decision is made. Also decides
  whether to render `FloatingNav` at all — `/login` gets none.
- **Sign out** — a button in `FloatingNav` (⎋ icon on desktop, "Sign out"
  row in the mobile sheet) calling `signOut(auth)`. No manual redirect
  needed: `onAuthStateChanged` fires, `user` becomes `null`, and
  `AppShell`'s effect sends you to `/login`.

**This client-side gate is a UX boundary, not the security boundary** — it
keeps a logged-out visitor from seeing dashboard pages, but someone could
bypass the redirect with devtools. The real protection is two separate
things that both had to change, because they're independent code paths to
the same data:

1. **`firestore.rules`** (`allow read, write: if request.auth != null`) —
   protects direct client SDK access, i.e. every `onSnapshot` call in
   `useFirestoreCollection`.
2. **`lib/firebase/verifyAuth.ts`** (`requireAuth()`, used in
   `app/api/students/route.ts` and `app/api/finance/route.ts`) — protects
   those Route Handlers specifically. This exists because they use
   `firebase-admin`, which **bypasses Firestore rules entirely by design**
   — updating `firestore.rules` alone would not have protected them.
   `requireAuth()` verifies the same ID token server-side via
   `firebase-admin/auth`, using `authFetch()` on the client to attach it.

### ⚠️ `firestore.rules` still needs deploying

Editing the file in this repo does not change what's live in your
Firestore project — the console (or `firebase deploy --only
firestore:rules`) is a separate step. Until you do one of those, Firestore
is still running the **old, pre-auth rules** (open reads), even though the
API routes and the login page are already enforcing auth. Two ways to
deploy:

- **Firebase CLI**: `npx firebase-tools deploy --only firestore:rules`
  (needs `firebase login` first, and `.firebaserc`'s project ID to be set).
- **Console**: Firestore Database → Rules tab → paste the contents of
  `firestore.rules` → Publish.

### Add Student / Add Transaction

- **"+ Add Student"** (`components/AddStudentModal.tsx`) — `name` and
  `contact` are required; every other field (`classGroup`, `schedule`,
  `parentConnected`, `tuition`, `nextPayment`, `tags`) is optional and only
  sent if filled in, matching the schema's optionality from Phase 3.
- **"+ Add Transaction"** (`components/AddTransactionModal.tsx`) — you type
  a positive amount and pick Income/Expense from a dropdown; the modal
  computes the signed value Firestore actually stores. The student dropdown
  is populated live via `useFirestoreCollection`, so a student added
  seconds earlier already shows up.
- Both show inline validation/request errors and close automatically only
  on success.

### Firestore CRUD service (`lib/firebase/db.ts`)

Full create/read/update/delete for all three collections. A document's
`id` is always Firestore's own `doc.id` — never stored as a field inside
the document — and `createdAt`/`updatedAt` are server timestamps,
converted to ISO strings on read.

- **students** — `name`, `contact`, `status` are the only required fields;
  everything else (`classGroup`, `schedule`, `parentConnected`, `tuition`,
  `nextPayment`, `tags`) is optional, because a lead created by
  `metaLeadReceiver` starts with just a name and contact info and gets
  enriched manually afterward.
- **transactions** — `amount` (signed: positive = income, negative =
  expense), `date`, `type`, `category`, `description`; `studentId` is
  optional since not every transaction is tied to a student (e.g. ad
  spend). `source` (`"manual" | "stripe"`) and `stripePaymentId` track
  where an entry came from — `app/api/finance/route.ts` always forces
  `source: "manual"` server-side regardless of what a client sends, so only
  `paymentReceiver` can ever produce a `"stripe"` entry.
- **lessons** — `date`, `topic`, `studentId`, `status`
  (`Scheduled` / `Completed` / `Cancelled`). New collection — no dashboard
  page consumes it yet (out of scope for Phases 3–4).

### Cloud Functions webhooks (`functions/src/`)

Neither function is deployed yet — see "Cloud Functions" further up for
the build/deploy commands. Once deployed, each gets its own public HTTPS
URL from `firebase deploy --only functions` output.

**`metaLeadReceiver`** — Meta Lead Ads webhook → new `students` document
(`status: "active"`, `source: "meta_lead_ad"`). Handles Meta's required GET
verification handshake, and three POST payload shapes: Meta's real
change-notification (fetches the full lead via the Graph API if
`META_PAGE_ACCESS_TOKEN` is set), a `field_data` array directly, or a flat
`{ name, email, phone }` body for manual testing with curl/Postman. If
`META_APP_SECRET` is set, verifies `X-Hub-Signature-256` before trusting
the body.

**`paymentReceiver`** — uses the real `stripe` package: `new
Stripe(process.env.STRIPE_SECRET_KEY)` and
`stripe.webhooks.constructEvent(req.rawBody, signature,
process.env.STRIPE_WEBHOOK_SECRET)` for verification (Stripe's own
replay-tolerant check, not a hand-rolled HMAC comparison). On
`checkout.session.completed` (`payment_status: "paid"`) or
`payment_intent.succeeded`, writes a `transactions` document with
`source: "stripe"` and `stripePaymentId` set to the PaymentIntent/session
id — visible in the Finance table as a distinct 💳 badge next to manually
entered rows (🖊 Manual). Reads `client_reference_id` / `metadata.studentId`
to link the transaction to a student when present. Any other event type,
or an unsuccessful payment, is acknowledged with 200 but not recorded —
normal Stripe webhook behavior, and required so Stripe doesn't eventually
disable the endpoint for non-2xx responses.

**Multi-currency, unified to USD**: this account charges customers in more
than one currency (`usd`, `cop`, `bob` all appear in real transaction
history), but `amount` on every `transactions` document is always USD —
one number, comparable and summable across the whole ledger, no per-row
currency juggling in the UI. That USD figure is Stripe's own converted
settlement amount, read from the charge's `balance_transaction` (expanded
via `stripe.paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] })`)
— not a rate this codebase computes. `originalAmount`/`originalCurrency`/
`exchangeRate` preserve what was actually charged, shown in the Finance
table's "Original" column, so nothing about the real transaction is lost —
only `amount` is normalized.

Stripe amounts are in the smallest unit of the currency — cents (÷100) for
most currencies, but *not* for "zero-decimal" ones (JPY, KRW, CLP, and
others — see `ZERO_DECIMAL_CURRENCIES` in `paymentReceiver.ts`), where the
integer amount already is the whole-unit value. This applies on both legs
of a conversion (the original charge and the settlement), and is handled
correctly for both.

**Real incident — read before touching this again**: an early version
assumed every charge amount was already USD (storing 190,000 COP as
literally `$190,000.00`). The fix (converting via `balance_transaction`)
uncovered a second, non-obvious problem: this account's balance doesn't
even settle purely in USD — historically (older than ~3 months as of this
writing, believed to trace back to a previously-connected EUR bank
account) roughly 60% of charges settled in **EUR**, not USD, and Stripe
has no API for further converting an already-settled currency into a
*different* target currency. `paymentReceiver` and the backfill script
both **skip and warn** rather than guess whenever a charge's real
settlement currency isn't `"usd"` — `amount` must always genuinely be USD,
never "close enough". The historical backfill was deliberately scoped to
the last 3 months (`--months=3`, all confirmed USD-settled) rather than
importing or approximating the older EUR-tainted data; see "Historical
Stripe backfill" below.

Copy `functions/.env.example` to `functions/.env` and fill in real values
before deploying — Firebase Functions v2 uploads this file's contents as
`process.env.*` automatically on `firebase deploy --only functions`, no
`defineSecret`/Secret Manager wiring needed for this to work as written.
(Secret Manager is a stricter option if you want it later — `firebase
functions:secrets:set NAME` plus a `secrets: [...]` entry on each
`onRequest` call — but isn't required.) `functions/.env` is gitignored;
never commit it.

### Setting up your Firebase project

1. Copy `.env.local.example` to `.env.local`.
2. In the [Firebase console](https://console.firebase.google.com/), open
   your project → **Project settings → General → Your apps**, add a Web app
   if you haven't, and copy its config into the `NEXT_PUBLIC_FIREBASE_*`
   vars. These are not secret — they identify the project to the browser;
   access control lives in `firestore.rules`, not in these values.
3. Under **Project settings → Service accounts**, click **Generate new
   private key** — this downloads a JSON file. It **is** secret — never
   commit it, move it outside the project, or paste its contents into
   chat/screenshots; it grants full Firestore read/write. Point
   `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` in `.env.local` at wherever you saved
   it (an absolute path, or relative to the project root). `.gitignore`
   already excludes Firebase's default `*firebase-adminsdk*.json` /
   `*service-account*.json` filename patterns as a safety net.
   (`FIREBASE_SERVICE_ACCOUNT_KEY` — pasting the JSON as one env-var line —
   also works, but the private key's embedded newlines are easy to mangle
   that way; prefer the file path.)
4. Edit `.firebaserc` and replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`
   with your actual project ID.
5. Enable **Firestore** in the Firebase console if you haven't (Native
   mode, any region).

Firebase Authentication is now implemented (see the "## Authentication"
section above) — `firestore.rules` requires `request.auth != null` for both
read and write. That file being correct in this repo is not the same as it
being live; see "⚠️ `firestore.rules` still needs deploying" above if you
haven't run `firebase deploy --only firestore:rules` (or pasted it into the
console) yet.

### Cloud Functions (`functions/`)

This is a separate Node project by Firebase CLI convention — its own
`package.json`, its own `node_modules`, its own TypeScript build
(`npm run build` compiles `src/` → `lib/`, which is what actually deploys).
It does not share dependencies with the root Next.js app.

## Deploying to production

Two independent deployments, to two different platforms — deploying one
doesn't deploy the other:

- **Cloud Functions → Firebase.** This is the only part that strictly
  *needs* to be public: Stripe and Meta must be able to reach
  `paymentReceiver`/`metaLeadReceiver` over HTTPS. They're protected by
  webhook signature verification instead of Firebase Auth, since Stripe/Meta
  can't sign in — that's correct and expected, not a gap.
- **The Next.js dashboard → Vercel** (or wherever). This *is* protected by
  Firebase Auth (once `firestore.rules` is actually deployed — see below).

### Deploy the Cloud Functions

```bash
cd functions
npm install                       # first time only
cp .env.example .env              # first time only
# edit functions/.env: fill in STRIPE_SECRET_KEY, META_* — leave
# STRIPE_WEBHOOK_SECRET blank for now, you don't have it yet (see below)

cd ..                              # back to the repo root, where firebase.json lives
npx firebase-tools login          # one-time, opens a browser
npx firebase-tools deploy --only functions
```

`firebase.json`'s `predeploy` hook runs `npm run build` inside `functions/`
automatically — no separate build step needed. This prints a URL per
function, e.g.:

```
✔  functions[paymentReceiver(us-central1)]: Successful create operation.
Function URL (paymentReceiver): https://us-central1-<project-id>.cloudfunctions.net/paymentReceiver
Function URL (metaLeadReceiver): https://us-central1-<project-id>.cloudfunctions.net/metaLeadReceiver
```

**Chicken-and-egg step for Stripe specifically**: Stripe only gives you the
webhook signing secret *after* you register the endpoint URL, but the
function needs that secret to verify signatures. So:

1. Deploy once (above) to get the `paymentReceiver` URL.
2. In the [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks) →
   Developers → Webhooks → **Add endpoint**, paste that URL, and select at
   least `checkout.session.completed` and `payment_intent.succeeded`.
3. Stripe shows you a **Signing secret** (`whsec_...`) — put that in
   `functions/.env` as `STRIPE_WEBHOOK_SECRET`.
4. Redeploy: `npx firebase-tools deploy --only functions`.

You're using Stripe **test** keys right now, so use Stripe's test-mode
webhooks page and test-mode events to verify end-to-end before ever
switching to live keys.

### Deploy `firestore.rules` (don't skip this)

Still a separate step from deploying functions, and still not done unless
you've explicitly run this or pasted the rules into the console:

```bash
npx firebase-tools deploy --only firestore:rules
```

Until this runs, Firestore is enforcing whatever rules were last
published in the console — check there if unsure.

### Deploy `storage.rules` (same deal, for Resources)

```bash
npx firebase-tools deploy --only storage
```

Same caveat as above: editing `storage.rules` in this repo doesn't take
effect until you run this (or paste it into Firebase console → Storage →
Rules). Skipping it doesn't break Resources — the admin SDK routes bypass
Storage rules the same way they bypass Firestore rules — it just means
direct client-side Storage access (nothing in this app does that today)
would be wide open until deployed.

### Deploy the dashboard to Vercel

Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel (or use
`npx vercel`), then set these in **Vercel → Project → Settings →
Environment Variables**:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from Firebase console | not secret |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from Firebase console | not secret |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from Firebase console | not secret |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | from Firebase console | not secret |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from Firebase console | not secret |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | from Firebase console | not secret |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | the service account JSON, as one line | **secret — see below** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | your Stripe publishable key | not currently read by any code — safe to set now for later |
| `STRIPE_SECRET_KEY` | your Stripe secret key | **yes, set this in Vercel too** — see note below |
| `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN` | your Kommo credentials | optional — powers /kommo and Overview's Kommo KPI |
| `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN` | your Meta Ads credentials | optional — dummy data if unset |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | your Gmail OAuth credentials | optional — dummy data if unset |
| `GMAIL_ALERT_QUERY` | Gmail search query for alert-worthy mail | optional — defaults to `label:alerts newer_than:7d` |
| `CRON_SECRET` | any random string (e.g. `openssl rand -hex 32`) | protects `/api/cron/recurring-payments` — see "Recurring payments" below |

**The one real trap**: locally you're using
`FIREBASE_SERVICE_ACCOUNT_KEY_PATH` pointing at `service-account.json` on
your machine. That file isn't in the repo (gitignored on purpose) and
Vercel's build has no access to your filesystem, so the path variant
**will not work there**. You must use `FIREBASE_SERVICE_ACCOUNT_KEY`
(the JSON pasted as one line) in Vercel specifically —
`lib/firebase/admin.ts` already supports both, this is purely an env-var
choice per environment, no code change needed.

**`STRIPE_SECRET_KEY` needs to be set in *both* places, separately** —
this trips people up: `functions/.env`'s copy is for the *Cloud Functions*
deployment (`paymentReceiver`'s webhook verification), and Vercel's copy is
for the *Next.js app itself* (`lib/api/stripe.ts` — Overview's revenue
chart, live Stripe balance, and payout tracking all call the real Stripe
API directly from Next.js API routes, not through Functions). They're
typically the same key value, but two separate env var scopes that don't
share anything. Leaving Vercel's `STRIPE_SECRET_KEY` unset doesn't break
anything — Overview just falls back to dummy revenue data and hides the
live Stripe balance/payout card — but it's not the "Functions-only" secret
some earlier guidance here implied.

The `functions/` folder itself is irrelevant to the Next.js deployment —
Vercel's build only bundles what's actually imported from
`app/`/`lib`/`components`, and nothing there imports from `functions/`, so
it's ignored automatically. `STRIPE_WEBHOOK_SECRET` and the `META_*`
*webhook*-secret vars (as opposed to `META_ACCESS_TOKEN` above, which the
Next.js app does use) genuinely are Functions-only, set in `functions/.env`,
not in Vercel.

### Go-live checklist

- [ ] `firestore.rules` and `storage.rules` deployed (not just edited in
      this repo)
- [ ] `functions/` deployed, `paymentReceiver` URL registered in Stripe,
      `STRIPE_WEBHOOK_SECRET` set and redeployed
- [ ] Vercel env vars set, using `FIREBASE_SERVICE_ACCOUNT_KEY` (not the
      `_PATH` variant) — including `STRIPE_SECRET_KEY` again if you want
      Overview's live balance/revenue, and `CRON_SECRET` if you're using
      recurring payments
- [ ] Signed in once on the deployed URL to confirm the full auth flow
      works outside localhost
- [ ] If using recurring payments: confirmed `vercel.json`'s cron actually
      shows up under Vercel → Project → Settings → Cron Jobs after deploy

## Historical Stripe backfill (`scripts/backfillStripeTransactions.ts`)

A one-time (but safely re-runnable) script that pulls every paid Checkout
Session from your Stripe account into Firestore's `transactions`
collection, for payments that happened before `paymentReceiver` existed.
It's a local script, not a deployed endpoint, on purpose — a one-off admin
task doesn't need to leave a standing network-reachable trigger behind.

```bash
npm run backfill:stripe -- --dry-run              # preview only, no writes — check this first
npm run backfill:stripe -- --months=3              # only sessions from the last N months
npm run backfill:stripe -- --months=3 --dry-run    # combine flags
npm run backfill:stripe                            # everything, writes to Firestore
```

Uses `@next/env` to load `.env.local` the same way Next.js itself does, so
it reads the same `STRIPE_SECRET_KEY` and (via
`FIREBASE_SERVICE_ACCOUNT_KEY_PATH`/`FIREBASE_SERVICE_ACCOUNT_KEY`) the same
Firestore credentials as the app. **Safe to run more than once**: every
write is preceded by a query for an existing document with the same
`stripePaymentId`, so nothing is ever duplicated.

Scope: only Checkout Sessions (`stripe.checkout.sessions.list()`, matching
`paymentReceiver`'s primary event). If this account also takes payments via
bare PaymentIntents with no Checkout Session involved, those wouldn't be
picked up by this pass — the dedup-by-`stripePaymentId` design means a
second script covering that case could run safely alongside this one with
zero double-count risk, since a PaymentIntent's id is the same id a
Checkout-Session-derived entry stores as `stripePaymentId`.

**`--months=N`** limits the scan to sessions created in the last N months —
this exists specifically because of the EUR-settlement incident below, and
is also just generally useful for a faster, smaller re-run.

**Real incident, while building this — two layers deep**:

1. The first version of this script (and of `paymentReceiver`) assumed
   every Stripe amount was USD cents. Running it against real data
   surfaced that this account charges in `usd`, `cop`, and `bob` — a
   190,000 COP payment (≈$47 USD) was being stored and displayed as
   `$190,000.00`.
2. Fixing that (converting via each charge's `balance_transaction`, which
   holds Stripe's real settlement amount) surfaced a second, deeper issue:
   this account's balance doesn't even settle purely in USD. ~60% of
   historical charges (all older than ~3 months) actually settled in
   **EUR**, not USD — and Stripe has no API to convert an
   already-settled currency into a different one after the fact.

The resolution: `amount` is always the real settled figure and both
writers **skip and warn** (never silently mislabel) whenever a charge's
settlement currency isn't `"usd"`. The historical import was deliberately
scoped with `--months=3` to the confirmed-USD-clean recent window (11
transactions, $666.17 total) rather than importing or approximating the
older EUR-tainted ~113 records. Revisit the older data later if needed —
it's still in Stripe, untouched, just not backfilled — once there's a
deliberate answer for converting EUR settlements (e.g. a live FX rate).

## Cash flow & balance (Overview)

Overview shows two different numbers that will *not* match each other, on
purpose, clearly labeled to avoid confusing them:

- **Ledger Net (all-time)** — `summarizeFinance()` over every `transactions`
  document ever recorded here (manual entries, Stripe rows, recurring
  payments). A bookkeeping total, not what's actually sitting in your bank
  or Stripe account.
- **Stripe Balance (live)** — `stripe.balance.retrieve()`, fetched fresh on
  every Overview load via `/api/stripe/balance` (server-only —
  `STRIPE_SECRET_KEY` never reaches the browser). This is Stripe's own
  figure for what it's actually holding right now, after fees and past
  payouts — the number that should match your Stripe dashboard.

They diverge because Ledger Net has no idea about Stripe fees, and includes
every manual entry you've ever typed in (rent, non-Stripe income, etc.)
that never touched Stripe's balance at all. Neither number is "wrong" —
they're answering different questions ("what's the all-time bookkeeping
total" vs "what can I withdraw from Stripe today").

**Last payout / next payout**: also from `/api/stripe/balance`
(`lib/api/stripe.ts`'s `fetchStripeBalanceOverview()`), via
`stripe.payouts.list()` for the real last-paid payout's amount/date. "Next
payout" is deliberately **not** a predicted date — Stripe's API only
exposes a predictable next-payout date for accounts on a fixed
daily/weekly/monthly schedule, not a threshold-based one (pay out
automatically once available balance crosses some amount, which is what
this account does at $250 — see `PAYOUT_THRESHOLD_USD` in
`lib/api/stripe.ts` if that threshold ever changes). So instead of
guessing a date, Overview shows a progress bar: current available balance
out of $250.

**Cash Flow chart**: bucketed Income vs Expense bars
(`cashFlowBuckets()` in `app/overview/page.tsx`), not a cumulative running
balance — a cumulative line over a ledger this size (hundreds of dollars,
not tens of thousands) mostly just drifts slightly up or down across 90
days with nothing meaningful to read. Bucketing shows the actual shape of
each period: bucket size scales with the selected range (daily under 14
days, weekly under 60, monthly beyond that) so you're never looking at 90+
tiny daily bars either.

## Kommo pipeline view (`/kommo`)

A dedicated page for browsing every Kommo lead across every pipeline stage
— separate from Overview's compact "Channel KPIs" summary (which just shows
lead count and win rate, with a "View full Kommo pipeline →" link here).

**Pull-based, not webhook-based**: despite the name "webhook" sometimes
coming up for this kind of integration, there is no Kommo webhook receiver
in this codebase — `/api/kommo` (server-only, `requireAuth()`-protected)
calls Kommo's REST API directly (`lib/api/kommo.ts`'s
`fetchAllKommoLeadsDetailed()`), paginating through every lead (250/page,
Kommo's max) and resolving each lead's numeric `pipeline_id`/`status_id`
into human-readable names via one `/leads/pipelines` call. The page
refetches on load and via its "↻ Refresh" button — not real-time like the
Firestore-backed pages, since this data lives in Kommo, not in Firestore.
(A real-time version would mean deploying a new Cloud Function as a
registered Kommo webhook target, mirroring `metaLeadReceiver` — worth doing
later if push-based updates matter more than a manual refresh.)

- **KPI tiles**: Today / Yesterday / This Week / Last Week lead counts,
  computed client-side from each lead's `created_at`.
- **Filters**: pipeline, stage (scoped to the selected pipeline), tag,
  a date-range preset (Today/Yesterday/This Week/Last Week/This
  Month/All time), and free-text search.
- **Sort**: newest, value, or name.
- **Two views** (`ViewToggle`): "By Stage" — read-only kanban-style columns,
  one per pipeline stage, mirroring the Projects board's visual style; and
  "List" — a sortable table.

## Recurring payments (subscriptions, ad spend, etc)

`/finance` has a "Recurring Payments" section for bills that should
generate a `transactions` entry automatically — SaaS subscriptions, a fixed
Meta Ads budget, a semi-annual CRM plan, anything with a predictable
repeat charge — instead of typing the same manual entry every time.

**Data model** (`RecurringTransaction`, `lib/types.ts`): a template with
`description`, `category`, `type`, `amount` (always positive — sign is
applied when the real transaction is generated), `active`, `lastPayment`
(null until first triggered), `nextPayment` (when the next transaction
fires), and `frequencyMonths` (1 = monthly, 6 = semi-annual, 12 = yearly,
etc — "Repeats every ___" in the modal).

**Two ways to create one**, both in "+ Add Recurring"
(`components/AddRecurringModal.tsx`):
- **Starting now/in the future** — pick a "Next payment date"; nothing is
  logged yet, the first transaction fires whenever that date arrives (see
  "Auto-trigger" below).
- **"Already paid once"** — check this box and enter "Paid on" instead. This
  is for exactly the situation of setting one up *after* you already paid
  it: pick "Kommo CRM Plan", $X, every 6 months, already paid on 19 Aug →
  the app immediately (a) logs a real `transactions` entry dated 19 Aug (so
  it shows in Finance like any normal payment, not just a future promise),
  and (b) sets `lastPayment: "2026-08-19"`, `nextPayment: "2027-02-19"`
  directly — no need to wait for the cron to "discover" a payment that
  already happened. Handled in
  `app/api/finance/recurring/route.ts`'s `paidOn` branch.

**Auto-trigger** (`app/api/cron/recurring-payments/route.ts`): finds every
active template whose `nextPayment` is today or earlier
(`listDueRecurringTransactions()` in `lib/firebase/db.ts`), creates a
`transactions` entry dated `nextPayment` with `source: "recurring"`, then
advances `lastPayment` to that date and `nextPayment` forward by
`frequencyMonths` (day-of-month clamped to the target month's last day —
e.g. Jan 31 + 1 month → Feb 28/29, not Mar 3; `addMonths()` in
`lib/dateUtils.ts`). Example: monthly, `nextPayment` was 2026-08-06 → a
transaction is generated dated 2026-08-06, `lastPayment` becomes
2026-08-06, `nextPayment` becomes 2026-09-06. Next month, the same thing
happens again.

**How it actually runs, twice**:
1. **Vercel Cron** (`vercel.json`) hits the route daily at 06:00 UTC with
   an `Authorization: Bearer $CRON_SECRET` header that Vercel adds
   automatically once `CRON_SECRET` is set in your Vercel env vars (see
   "Deploy the dashboard to Vercel" above) — this only works once deployed,
   there's no local equivalent of Vercel's cron scheduler.
2. **"▶ Run due payments now"** button on `/finance` calls the same route
   via `authFetch()` (your signed-in session instead of `CRON_SECRET`) — use
   this to test locally, or to trigger a payment early without waiting for
   the actual date.

Both paths hit the exact same route and logic — there's no separate "test
mode".

## Date display format

Every date shown as text anywhere in the app — transaction dates, due
dates, recurring payment dates, Kommo lead dates, Resources timestamps —
is consistently `DD-MM-YYYY` via `formatDateDMY()` in `lib/dateUtils.ts`.
This is a **display-only** convention: every `<input type="date">` (the
native browser date picker used everywhere dates are entered) still uses
HTML's required `YYYY-MM-DD` value format internally — that's not something
a web page can override, only how the picker visually renders it (locale-
dependent, outside this app's control). Firestore itself also always
stores `YYYY-MM-DD`, which is what every `addDays()`/`addMonths()` in
`lib/dateUtils.ts` and every `<` / `>` date comparison in this codebase
assumes — `YYYY-MM-DD` sorts and compares correctly as a plain string,
`DD-MM-YYYY` does not. Only the last step, turning that stored value into
text on screen, changes.

## Student payment status (Up to Date / Pending / Late)

Every student has a due date (`Student.nextPayment` — same field that
existed before, now doing more work) on a **fixed monthly schedule**: it
never moves based on when a payment actually arrives, only forward by
exactly one calendar month each time a matching payment is recorded. Status
is **derived, never stored** (`lib/studentStatus.ts`'s
`studentPaymentStatus()`), so it can never drift out of sync with the due
date:

- **Up to Date** — today is on or before the due date.
- **Pending** — 1–5 days past the due date (a grace window,
  `PAYMENT_STATUS_GRACE_DAYS` in `lib/studentStatus.ts`).
- **Late** — more than 5 days past due, still unpaid.

Shown everywhere a student appears — `/students`, Overview's Students
section, and Overview's "Action Required" list (Pending + Late students,
replacing the old simpler "Overdue Tuition" widget).

### Connecting a student to their parent's payments

This is the part that makes status update **automatically** when a parent
actually pays, instead of you manually marking each student paid:

1. Open the student in `/students` → **Edit** → fill in **"Parent's
   email"** with the email address the parent pays with (the one Stripe
   will see at checkout).
2. That's it. From then on, any transaction whose payer email matches
   (case-insensitively) advances that student's due date by one month —
   which alone makes their status flip back to "Up to Date", since the new
   due date is now in the future.

**Where the "payer email" on a transaction comes from**, depending on
where the transaction was created:
- **Stripe webhook** (`functions/src/paymentReceiver.ts`) — automatic,
  taken from `session.customer_details.email` (Checkout) or
  `intent.receipt_email` (PaymentIntent). Nothing to configure beyond
  step 1 above and having `functions/` deployed (see "Deploy the Cloud
  Functions").
- **Manual entry** (`+ Add Transaction` on `/finance`) — there's an
  optional "Payer email" field in that modal; fill it in (or just pick the
  student directly from the "Student" dropdown in the same modal — either
  one works, `applyPaymentToStudent()` in `lib/firebase/db.ts` accepts a
  direct `studentId` or falls back to matching by email).
- **Recurring payments** — only applies if the recurring template's type
  is Income and has a `studentId` (an expense-type recurring payment, e.g.
  ad spend, never touches student status).

**Example** (the exact scenario a fixed schedule is designed for): due date
06 July, parent actually pays 10 July (4 days late — still "Pending" at
that point, inside the grace window). The payment advances the due date by
one month from where it *was*, not from the payment date: new due date is
06 August, not 10 August. If they'd paid on time, same result — 06 August
either way. This is deliberate: a due date that shifted based on payment
date would let a chronically-late parent slowly walk their due date later
and later, month by month.

**If nobody pays**: the due date just sits there unadvanced, and status
mechanically walks from Up to Date → Pending (day 1) → Late (day 6) as
`studentPaymentStatus()` re-evaluates against today on every page load —
no cron job needed for the status itself (only the due-date *advance* on
an actual payment needs code to run, and that already happens inline in
whichever route created the transaction).

### Plans (Main Course / Initial Demo)

`Student.plan` is one of `"Main Course"` or `"Initial Demo"` — set in the
Add/Edit Student modal, filterable on `/students` and in Overview's
Students section. Purely a categorization field; nothing else in the app
branches on it yet (e.g. no separate pricing/tuition defaults per plan).

### Profile pictures

`Student.photoUrl` is shown as a circular avatar (falls back to the
student's initial if unset) in both the Students grid and list views. The
Add/Edit Student modal uploads the file directly to Firebase Storage
(`studentPhotos/{studentId}`, one object per student — a re-upload just
overwrites it) via `app/api/students/[id]/photo`, which serves it back
through a short-lived signed URL — same pattern as Resources
(`app/api/resources/files/[id]/content`). `photoUrl` ends up pointing at
that route (`/api/students/{id}/photo`), not a hotlinked third-party URL.

**Don't paste a Google Drive "share" link here** — confirmed the actual
failure mode: a Drive share URL (`drive.google.com/file/d/…/view`) serves
an HTML viewer page, not the image's raw bytes, so an `<img>` tag just
renders nothing no matter how the link's sharing permissions are set. The
upload button sidesteps this entirely. A collapsed "Use a direct image URL
instead" field is still there in the modal for a URL that's already a real
image host (e.g. `…something.jpg`), for cases where uploading isn't what's
wanted.

### Contact field removed, notes added

`Student.contact` (a lead's raw phone/email, from before `parentEmail`
existed) is no longer shown or editable anywhere in the Students UI —
`parentEmail` replaced it as the identifying field, since that's what
actually drives due-date matching. The field itself still exists in the
type (optional) and in Firestore for old records / anything
`metaLeadReceiver` still writes, just hidden from the app.

In its place, `Student.notes` (free text, "things to remember" about a
student or their parent) is editable in the Add/Edit modal and shown as a
small italic block on each card in the Students grid view. Tags on the
student form now use the same type-and-press-Enter chip editor as
Resources' file tags, instead of a raw comma-separated text field.

### Test data

`npm run seed:test-students` adds 4 students spanning both plans and three
different due-date states (one comfortably in the future, one a few days
overdue, one well past due, one due exactly today) — safe to run more than
once, skips anyone whose name already exists.

## Resources (Firebase-backed file manager)

`/resources` is a file manager — folders, images, video, PDFs, docs — backed
by **Firestore** (folder tree + file metadata: title, description, tags,
size, timestamps) and **Firebase Storage** (the raw bytes), the same Firebase
project already used by Students/Finance. `lib/resources.ts` is the
server-only CRUD layer (mirrors `lib/firebase/db.ts`'s conventions); writes
go through `app/api/resources/**` (protected by `requireAuth()`), reads on
`/resources` itself are a live `useFirestoreCollection` subscription so
uploads/edits/deletes from any signed-in device show up everywhere within a
network round-trip — no manual refresh.

- **Folders** — create, rename, and nest arbitrarily. Deleting a folder
  recursively deletes its subfolders and their files (Storage objects
  included).
- **Files** — upload via "+ Upload" or by dragging files from your desktop
  onto the page. Every file gets a title (defaults to its filename), an
  editable description, and freeform tags — click a file to edit these.
- **Organizing** — drag a file or folder tile onto another folder tile, or
  onto a breadcrumb, to move it. Drop onto "🏠 All Resources" to move
  something back to the top level.
- **Browsing** — breadcrumb navigation, search scoped to the current folder,
  filters for type (Images / Videos / Documents / Other) and tag, sort by
  name/newest/largest/type, a Grid/List toggle, and a size slider (Grid
  view).
- **Serving** — `/api/resources/files/[id]/content` redirects to a
  short-lived (15 min) Firebase Storage signed URL, which natively supports
  HTTP Range requests (video scrubbing works the same as before). The file
  detail modal's **Open ↗** button just opens that URL in a new tab — the
  old "launch with the OS's default app" / "reveal in File Explorer" buttons
  were removed, since those only ever made sense when the Next.js process
  was running on your own machine.

### Data on a deployed / mobile build

Every page in this app used to fall into one of two buckets: backed by
Firestore (Students, Finance — worked fine deployed), or backed by the
local filesystem under `data/` (Resources, Projects, Content, Agents —
**did not**). Hosts like Vercel run your server as short-lived, mostly
read-only functions with no persistent local disk, so a local-disk write
(uploading a file, creating a project, editing content) would either fail
outright or vanish the moment that function instance recycled — and reads
of files not bundled at deploy time (anything added after the last deploy)
would 404. Worse for Resources specifically: nothing uploaded from your
phone would ever be visible from your laptop, since each device would be
hitting a different, ephemeral filesystem.

All four have now been migrated to Firestore (Resources also uses Firebase
Storage for the raw file bytes) — the same real, shared, always-on backend
already used by Students/Finance. Open the deployed URL on your phone, sign
in, and every page is the same live data as on any other device, writes
included. There is no longer any app code that reads/writes `data/` at
request time — `lib/markdown.ts` (the old fs-based CRUD layer) was deleted.

**One-time migration**: if you have existing data under the old
`data/resources/` or `data/{projects,content,agents}/` from before this
change, run these once (locally, with `.env.local` pointing at your
Firebase project) to copy everything into Firestore/Storage — both are
safe to run more than once, they skip anything already migrated:

```bash
npm run migrate:resources
npm run migrate:markdown
```

Note: Resources uploads are still read fully into memory before being sent
to Storage, so very large files (multi-GB video) will be slower and use
more RAM than a true streaming upload — fine for typical images/PDFs/short
clips.

## Frontmatter templates (Projects, Content, Agents seed files)

These `data/**/*.md` files are no longer read by the running app — they
exist solely as input for `scripts/migrateMarkdownToFirebase.ts` (see
above). To add a new project/content item/agent before running that
script, drop a file matching one of these templates into the matching
folder; anything added after the last migration run just needs the script
run again.

**Projects** (`data/projects/<slug>.md`)

```yaml
---
title: Redesign landing page
priority: High            # Low | Medium | High | Urgent
field: Marketing
status: In Progress       # To Do | In Progress | Paused | Done
progress: 60               # 0-100
---
Free-text notes / task details.
```

**Content** (`data/content/<slug>.md`)

```yaml
---
title: Welcome email sequence
cover: /covers/placeholder.svg   # path in /public or a full URL
tags: ["email", "onboarding"]
publishedAt: "2026-06-01"
---
Full markdown body — shown when you click the cover image.
```

**Agents** (`data/agents/<slug>.md`)

```yaml
---
name: Daily KPI Digest
role: Summarizes revenue, leads, and ad spend into a morning digest
model: claude-sonnet-5
effort: low                # low | medium | high | xhigh | max
schedule: "0 7 * * *"      # cron expression or human-readable
status: active              # active | paused | error
summary: One-sentence description shown on the card.
---
Optional longer notes about what the agent does.
```

## Local setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/overview`.

Every collection (Students, Finance, Projects, Content, Agents, Resources)
reads/writes Firestore in real time via `onSnapshot` — no manual refresh
anywhere. Every page with editable records (Students, Finance, Projects,
Content) has full Add/Edit/Delete in the UI, deletes gated behind a
confirmation dialog (`components/ConfirmModal.tsx`) so a stray click can't
lose data; Finance also supports selecting multiple rows via checkbox for a
bulk delete. Agents is read-only, seeded via `npm run migrate:markdown` —
see "Firebase migration status" above.

## API key integration (channel KPIs)

Every channel KPI integration falls back to deterministic dummy data when
its env vars are missing, so Overview's "Channel KPIs" section is fully
usable with zero keys configured.

| Integration | Env vars | Setup steps |
|---|---|---|
| Stripe | `STRIPE_SECRET_KEY` | `lib/api/stripe.ts` — restricted key with read-only Balance/Charges access |
| Kommo CRM | `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN` | `lib/api/kommo.ts` — private integration token |
| Meta Ads | `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN` | `lib/api/meta.ts` — Marketing API, ads_read permission |
| Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_ALERT_QUERY` (optional) | `lib/api/gmail.ts` — OAuth 2.0 desktop app credentials + a Gmail filter/label for alert mail |

All four `lib/api/*.ts` files now call the real API once their env vars are
set — restart `npm run dev` (or redeploy) after adding credentials so
Next.js picks up the new `.env.local` values. Overview's Channel KPIs
section reads a `sources` field from `/api/kpis` to know which cards are
still on dummy data and shows a "Demo data" badge only on those, so there's
nothing to change in the UI as each integration gets connected.

Note: once Phase 4's `metaLeadReceiver` webhook is live, it will overlap
with `lib/api/meta.ts`'s live ad-spend numbers here — that's a real signal
(live leads) landing in Firestore, while this is a separate live KPI
number on Overview pulled straight from the Marketing API. Reconciling those is out of scope for this migration
but worth revisiting once Phase 4 ships.

## Meta view (`/meta`)

A dedicated page for everything Meta beyond ad spend — Facebook Page +
Instagram content, comments, Lead Ads, and a posting calendar. Five tabs,
each fetched independently and lazily (a tab you never open never calls the
Graph API):

| Tab | What it shows | Backed by |
|---|---|---|
| Overview | Period-over-period growth dashboard (This Month / Last Month / Last 3 Months) — followers, posts published, interactions, best post of the period per platform, Ad Spend/Leads, and Ad Campaigns as a section underneath | `app/api/meta/growth` → `lib/api/metaGrowth.ts`, `app/api/meta/campaigns`, `app/api/kpis` |
| Posts | Facebook + Instagram posts as cards — cross-posted content (same caption, published within an hour on both platforms) merges into one card with both platform badges; click through for the full per-platform metrics breakdown | `app/api/meta/posts` → `lib/api/metaContent.ts` |
| Comments | Comments across recent posts on both platforms — reply, hide/unhide, delete | `app/api/meta/comments` → `lib/api/metaContent.ts` |
| Leads | Native Lead Ads form submissions | `app/api/meta/leads` → `lib/api/metaLeads.ts` |
| Calendar | Month view of scheduled/published/failed posts; click a day to schedule, click a post to edit/publish-now/delete | Firestore `scheduledMetaPosts` (real-time) + `app/api/meta/schedule/*` |

Messenger/inbox management was deliberately left out of scope.

**Why there's no cross-platform Engagement Rate**: Meta removed
per-post reach/impressions from the Graph API for regular Facebook Page
posts (confirmed live — every variant of that metric now returns "(#100)
The value must be a valid insights metric", not a permissions issue).
Instagram still exposes real per-post reach, so a reach-weighted engagement
rate would only ever reflect Instagram — mixing in Facebook's structural
zeros would silently understate it rather than average anything real.
Overview's growth cards stick to what's genuinely comparable across both
platforms (followers, posts, raw interactions); the Instagram-only
engagement rate still shows up in Overview's "Best Post" section and in the
Posts tab, clearly scoped to Instagram.

**Why followers show "(partial)" sometimes**: Facebook's `page_follows`
insight has ~90 days of live history; Instagram's `follower_count` insight
is hard-capped by the platform at a trailing 30 days — confirmed live, any
request further back fails outright. `app/api/cron/meta-audience-snapshot`
captures both platforms' follower counts into Firestore
(`metaAudienceSnapshots`) once a day specifically so Instagram's older
comparisons (Last Month, Last 3 Months) can fall back to real stored data
instead of Meta's own capped window — see `lib/api/metaGrowth.ts`'s header
comment. Until enough days have been captured, older Instagram comparisons
are labeled "(partial)" rather than presented as more precise than they
are; this fills in on its own as the snapshot history grows.

**Extra setup beyond the ads token** (`lib/api/meta.ts`'s `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID`):

- The token's permissions need to include `pages_show_list`,
  `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`,
  `pages_manage_ads`, `instagram_basic`, `instagram_manage_comments`,
  `instagram_manage_insights`, `instagram_content_publish`, and
  `leads_retrieval` (that last one needs Meta App Review — the Leads tab
  shows a clear error naming exactly which permission is missing if it
  isn't granted yet).
- The Facebook Page needs its Instagram Business Account actually linked
  (Meta Business Suite > Settings > Linked accounts) for the Instagram
  side of Posts/Comments/Calendar to return anything — `lib/api/metaCore.ts`'s
  `resolveMetaAssets()` auto-detects it from the Page once linked.
- Optional: `META_PAGE_ID` / `META_IG_BUSINESS_ACCOUNT_ID` in `.env.local`,
  only needed if the token can see more than one Page.

**Scheduling a post**: the Calendar stores every post as a Firestore
`scheduledMetaPosts` doc and posts it through our own trigger rather than
relying on Facebook's native `scheduled_publish_time` — that keeps Facebook
and Instagram posts editable/cancelable the same way right up to send time,
since Instagram's API has no native "post later" of its own. Instagram
posts need a publicly reachable image URL (Meta's servers fetch it
directly) — there's no upload-and-host step built in yet; paste a URL to an
already-hosted image. `app/api/cron/meta-publish` publishes whatever's due;
**Vercel's Hobby plan only allows daily cron**, so for on-time publishing
either use the Calendar's "Publish due posts" / a post's "Publish Now"
button, or point an external scheduler (e.g. cron-job.org) at that endpoint
with `Authorization: Bearer $CRON_SECRET` on a tighter interval.

## Teaching view (`/teaching`)

An Excalidraw whiteboard for live lessons, with a lesson library and a
screen-share presentation mode.

- **Editor**: `@excalidraw/excalidraw`, loaded via `next/dynamic({ ssr: false })`
  end to end — it touches `window` at module scope, so nothing that imports
  from it (even a type-only import of the wrong kind) can survive Next's
  server render pass. `app/teaching/page.tsx` is a thin ssr:false wrapper;
  all the actual logic lives in `components/TeachingView.tsx`, whose header
  comment explains the exact SSR crash this avoids (confirmed live — see
  that file before adding a new top-level import from the package).
- **Lessons library**: Firestore `lessonFiles` (metadata) + Firebase
  Storage `lessons/{id}.excalidraw` (the actual scene JSON) — same
  metadata/bytes split as Resources, via `lib/teaching.ts`. The sidebar's
  "Import" button accepts an existing `.excalidraw`/`.json` export;
  "+ New" creates a blank one. Loading a lesson calls
  `excalidrawAPI.updateScene()` imperatively rather than remounting the
  canvas — the same canvas instance is reused for every lesson switch.
  There's no autosave; the Save button serializes the live scene with
  Excalidraw's own `serializeAsJSON()` (strips transient state like
  collaboration cursors) and `PUT`s it back to
  `app/api/teaching/lessons/[id]/content`.
- **Screen Share mode**: toggles the same mounted canvas into a fixed,
  near-fullscreen overlay (`zIndex: 10000`, above the app's own nav) with
  Excalidraw's own chrome hidden (`zenModeEnabled`) — deliberately built as
  one render tree with conditional styling, not two separate
  early-returned layouts, specifically so the canvas component never
  unmounts when toggling modes (an early version did this wrong and would
  have silently wiped the whiteboard on every toggle).
- **Gamification bar**: bottom-overlay buttons in Screen Share mode —
  Confetti, Victory, Drum Roll, Applause. `lib/soundEffects.ts` synthesizes
  every sound with the Web Audio API (oscillators + generated noise
  buffers) rather than shipping audio files — zero extra assets, no
  licensing question, works offline. Confetti itself is `canvas-confetti`.

## Running it daily

1. `npm run dev` each morning (or leave it running) and sign in at
   `/login` — every page redirects there until you do.
2. Check `/overview` for the day's balance, revenue, leads, ad spend, and
   alerts — it's the one dashboard for all of it now.
3. Add/update projects and content directly from their pages, or browse
   them (with search/sort/filter) right from Overview's Students/Projects
   sections — changes are written straight to Firestore and show up
   everywhere instantly.
4. Drop files onto `/resources` to file them away — organize into folders,
   tag them, and add notes as you go.
5. Students and Finance update instantly (`onSnapshot`, no refresh needed).
   Use "+ Add Student" / "+ Add Transaction" for manual entry, or (once
   `functions/` is deployed) let `metaLeadReceiver` / `paymentReceiver`
   create records automatically. Editing/deleting existing records still
   requires the Firebase console.

## Error handling

- **Firebase not configured** (`/students`, `/finance` — no valid
  `FIREBASE_SERVICE_ACCOUNT_KEY_PATH`/`FIREBASE_SERVICE_ACCOUNT_KEY`): a
  "Migrating to Firestore" message with the specific missing-config reason,
  instead of a crash.
- **Failed API fetch**: surfaced as a "Couldn't load data" message with the
  underlying error.
- **Empty data** (folder exists but has no files, or a filter matches
  nothing): a neutral "No results" state is shown instead of an empty grid.
- Each major view is wrapped in a React error boundary so a rendering bug in
  one section doesn't take down the rest of the page.
