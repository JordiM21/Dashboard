---
name: Daily KPI Digest
role: Summarizes revenue, leads, and ad spend into a morning digest
model: claude-sonnet-5
effort: low
schedule: "0 7 * * *"
status: active
summary: Runs every morning at 7am and emails a one-paragraph summary of yesterday's KPIs.
---

Pulls from Stripe, Kommo, and Meta Ads dummy/real data and posts a digest to the manager's inbox.
