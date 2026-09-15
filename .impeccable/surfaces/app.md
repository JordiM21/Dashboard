---
version: 1
slug: "app"
primary_target: "app"
related_targets: []
---

## Scope

Whole-app redesign: shared design system (tokens, nav, buttons, cards, badges, forms) plus a structural desktop-grid pass on Overview and Tasks. Mode: Operate (internal ops dashboard, single admin user).

## Audience / job / constraints

Jordi, solo founder, running LET Academy day to day from this dashboard. Job: see the whole business (tasks, cash, students, pipeline, ads) and act on it fast, mostly from a desktop, sometimes from the installed PWA on mobile. Constraint: dates stay DD-MM-YYYY, quick task capture and bottom nav stay one tap on mobile, integration pages (Kommo/Meta) stay read-only monitors.

## Direction contract

THESIS: The public LET Junior brand (warm, rounded, playful) runs the internal ops tool too — but colour carries the brand while layout carries the operate job: a wide, dense, grid-based canvas that shows the whole business without scrolling, not a marketing page pretending to be a dashboard.

OWN-WORLD: Mango/bubble/splash/sky/sun brand palette on a warm off-white ground (`#FFFCFA`)/near-black-violet dark ground (`#15111C`); Fredoka 600 display + Figtree body, both self-hosted via `next/font/google`; pill radius on every button/chip/badge, `--r-l`/`--r-xl` on cards and panels; warm-tinted shadows; spring easing on presses, standard easing on hovers. Named adaptation: this app's general "primary action" fill (nav active tab, primary buttons, quick-add) reuses the source system's `--cta`/`--cta-deep` pair (the one pairing proven to pass 4.5:1 with white text) rather than raw `--mango`, since the source system reserved that pair for a single marketing buy button this app doesn't have.

STORY: Jordi opens Overview and sees today's work and the state of the business in one screen on a laptop; every other page (Classroom, Finance, Tasks, Kommo, Meta) reads as the same system at a different density.

FIRST VIEWPORT: Overview splits into a wide main column (Today capture + task cards, Action Required table, Cash Flow bar chart, a 3-up chart row) beside a pinned 340px "At a glance" rail (core KPIs, Stripe payout, channel stats) — the numbers stay visible beside whatever else is being scanned. Tasks' due-date buckets become side-by-side board columns instead of stacked full-width sections. Page canvas widened from 1180px to 1600px app-wide so every auto-fit grid (KPI strips, chart rows, task boards, resource tiles) packs more per row on a real monitor.

FORM: Brief-pinned world (the user supplied the complete token/component spec in LET-Junior-Web-Design-System.md) — no concept-seed roll; direction taken directly from the pinned system per new-work.md's "a user- or brief-pinned direction beats the roll, always."

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

Authenticated pages (Overview, Tasks, Finance, Classroom, Kommo, Meta) not yet visually verified in-browser — the app gates every route behind real Firebase email/password auth and Claude cannot enter the user's password. Verification pending the user signing in on the running preview, or sharing screenshots.
