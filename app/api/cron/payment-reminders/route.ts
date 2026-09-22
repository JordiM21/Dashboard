import { NextRequest, NextResponse } from "next/server";
import { listStudents } from "@/lib/firebase/db";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import { addDays, localDateIso } from "@/lib/dateUtils";
import { PAYMENT_STATUS_GRACE_DAYS } from "@/lib/studentStatus";
import { buildTuitionAlert, sendTuitionAlert, type HubTuitionPayload } from "@/lib/paymentReminders";

export const dynamic = "force-dynamic";

/**
 * Tuition alerts to the LET Junior Hub — the "due" and "overdue" halves.
 * ("paid" isn't here: it's an event, fired from applyPaymentToStudent the
 * moment a payment actually lands.)
 *
 * Runs daily, and sends a student at most one message per cycle, because
 * each trigger is a DATE MATCH rather than a state check:
 * - due: their due date is tomorrow. True on exactly one day.
 * - overdue: today is the first day they count as "late" — their due date
 *   plus the grace window (lib/studentStatus.ts). Also exactly one day.
 *
 * That "exactly one day" is the whole design, not a nicety. The Hub has no
 * dedupe yet, so one POST is one Telegram message — a naive "every student
 * whose status is late" sweep would re-notify the same family every single
 * morning until they paid.
 *
 * Two ways in, same as the recurring-payments cron:
 * - Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * - A signed-in admin via authFetch, so it can be exercised locally.
 *
 * `?dryRun=1` returns exactly what would be sent and posts nothing.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const header = req.headers.get("authorization");
  if (process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`) return true;
  try {
    await requireAuth(req);
    return true;
  } catch {
    return false;
  }
}

async function run(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  if (!process.env.LET_HUB_TUITION_WEBHOOK_URL && !dryRun) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "Set LET_HUB_TUITION_WEBHOOK_URL to the Hub integration URL. Add ?dryRun=1 to preview without it.",
      },
      { status: 501 }
    );
  }

  try {
    const today = localDateIso();
    // The two values a student's `nextPayment` can equal today. Derived
    // from the grace window rather than hardcoded, so changing
    // PAYMENT_STATUS_GRACE_DAYS keeps the "overdue" ping landing on the
    // same day the UI first calls them Late.
    const dueOn = addDays(today, 1);
    const overdueOn = addDays(today, -(PAYMENT_STATUS_GRACE_DAYS + 1));

    const students = (await listStudents()).filter((s) => s.status === "active");
    const payloads: HubTuitionPayload[] = [
      ...students.filter((s) => s.nextPayment === dueOn).map((s) => buildTuitionAlert(s, dueOn, "due")),
      ...students.filter((s) => s.nextPayment === overdueOn).map((s) => buildTuitionAlert(s, overdueOn, "overdue")),
    ];

    if (dryRun) return NextResponse.json({ dryRun: true, today, dueOn, overdueOn, count: payloads.length, payloads });

    // Sequential, not Promise.all: these become Telegram messages, and
    // sending them in order keeps the morning's alerts readable. It's a
    // handful of requests once a day — nothing here needs parallelising.
    const results = [];
    for (const payload of payloads) {
      results.push({ ...payload, ...(await sendTuitionAlert(payload)) });
    }

    const sent = results.filter((r) => r.sent).length;
    return NextResponse.json({ today, notified: sent, failed: results.length - sent, results });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json({ error: "run_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
