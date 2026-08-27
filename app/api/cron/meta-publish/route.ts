import { NextRequest, NextResponse } from "next/server";
import { listDueScheduledMetaPosts } from "@/lib/firebase/db";
import { publishScheduledPost } from "@/lib/metaPublisher";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

/**
 * Publishes every ScheduledMetaPost whose time has arrived. Same two ways
 * in as app/api/cron/recurring-payments/route.ts: Vercel Cron with
 * CRON_SECRET, or a signed-in admin hitting it directly (the Calendar tab's
 * "Publish due posts" button, for testing locally or between cron runs).
 *
 * Vercel's Hobby plan only allows daily cron — see vercel.json's comment —
 * so exact-time publishing on Hobby depends on that manual button, or an
 * external scheduler (e.g. cron-job.org) hitting this endpoint on a tighter
 * interval with the same CRON_SECRET.
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

  try {
    const due = await listDueScheduledMetaPosts(new Date().toISOString());
    const results = await Promise.all(
      due.map(async (post) => {
        const published = await publishScheduledPost(post);
        return { id: post.id, status: published.status, errorMessage: published.errorMessage ?? null };
      })
    );
    return NextResponse.json({ triggered: results.length, results });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const hint = /index/i.test(message)
      ? " This looks like a missing Firestore index — run `npx firebase-tools deploy --only firestore:indexes`."
      : "";
    return NextResponse.json({ error: "run_failed", message: message + hint }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
