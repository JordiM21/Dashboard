# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Single primary user: Jordi, the founder/operator of LET Academy (parent brand of LET Junior, an online English school for kids). He runs the whole business — teaching ops, students, finances, marketing/lead-gen, and a task list — solo, and uses this dashboard as his daily internal command center. No self-serve sign-up; single admin account created manually in Firebase console. Installable PWA, used from both desktop (primary, per this redesign) and mobile/tablet on the go.

## Product Purpose

An internal operations dashboard for running a small language-school business end to end: today's tasks, cash flow / income-expense ledger, student roster and classroom curriculum, a sales/lead pipeline (Kommo), and ad/marketing channel performance (Meta) — all backed by Firestore with real-time updates, replacing what used to be spreadsheets + Zapier/Make. Success = Jordi can see the state of the whole business and act on it (add a task, log a payment, add a student, check a lead) without switching tools or scrolling through redundant views.

## Positioning

Not a generic admin-panel template or a multi-tenant SaaS dashboard — it is shaped exactly around how one specific solo operator runs one specific business, so pages exist only where a real daily workflow needs them (no manager/reporting layer for a team that doesn't exist).

## Operating Context

Pages today: `/overview` (the main dashboard — today's tasks, KPIs, cash flow, channel performance, students, all in one place), `/students` (Classroom: Groups / Curriculum / Students / Resources — Teaching was merged into this), `/finance` (income/expense ledger + recurring/subscription payments), `/tasks` (capture box, buckets by due date, optional parent projects), `/kommo` (dedicated pipeline view — every lead, stage, tag, date filter), `/meta` (ads, posts, audience growth). Shared `FloatingNav` for navigation across all pages; a `LiveBadge` on each page shows Firestore connection/last-snapshot status.

Integration pages (Kommo, Meta, Stripe) are monitors, not consoles — they report externally-sourced data; the dashboard doesn't act back into those external systems from here.

## Capabilities and Constraints

- Auth: Firebase email/password, single admin, client-side route gate (`AppShell`) plus real server-side enforcement (`firestore.rules` + `requireAuth()` in Route Handlers) — these are two independent protections and both matter.
- Real-time data: `onSnapshot` reads client-side via `useFirestoreCollection`; writes go through admin-SDK Route Handlers (`app/api/*`).
- Webhooks already wired (not yet deployed): `metaLeadReceiver` (Meta Lead Ads → new student), `paymentReceiver` (Stripe → transaction, multi-currency charges unified to USD for the ledger, original amount/currency preserved separately).
- Dates always display as DD-MM-YYYY throughout the app (existing convention, not to be broken by the redesign).
- The configured Meta ad account currently has no live campaigns (the real one is elsewhere) — empty/zero states for Meta data are a normal, expected condition, not a bug to design around as an error.
- Quick task capture and bottom navigation must remain reachable in one tap on mobile.

## Brand Commitments

Visual identity is being deliberately aligned to the public LET Junior marketing site's design system (Fredoka + Figtree type, mango/bubble/splash/sky palette, warm off-white ground, pill radii, glass, blob/gradient decoration, spring motion) — decision made in this redesign to bring the internal tool's brand in line with the public-facing brand, at full playful intensity rather than a toned-down "ops" subset. Existing site palette/typography tokens are the new source of truth; the prior "cream/cake" internal look is being replaced, not preserved.

## Evidence on Hand

- `README.md` (extensive, current) documents the real data model, Firebase migration status, and page-by-page behavior — treat it as ground truth for what each page does.
- `LET-Junior-Web-Design-System.md` (user-supplied) is the full extracted token/component/motion spec for the marketing site and is the binding visual source for this redesign.
- No fabricated metrics, testimonials, or business data — all figures shown come from the real Firestore/Stripe/Kommo/Meta data at runtime.

## Product Principles

1. One page, one job — no two pages/sections showing near-duplicate information (the old standalone "Manager" page was already folded into Overview for this reason).
2. Monitor pages report; they don't pretend to control the external system they mirror.
3. Solo-operator speed: the fastest path to add/see something wins over completeness or configurability.
4. Desktop is the primary canvas now (wide grids, minimal scrolling); mobile stays fully functional, not just "not broken."
5. Real-time by default — if data can update live via Firestore, the UI reflects it without a manual refresh.

## Accessibility & Inclusion

No specific standard mandated by the user; standard web accessibility practice (contrast, focus states, touch targets) applies as general craft floor, not a compliance requirement driving scope.
