import { NextRequest, NextResponse } from "next/server";
import { upsertMetaAudienceSnapshot } from "@/lib/firebase/db";
import { fetchMetaAudienceSnapshot } from "@/lib/api/metaContent";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import { localDateIso } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

/**
 * Records today's Facebook/Instagram follower counts into Firestore.
 * Instagram's own `follower_count` insight is hard-capped by the platform
 * at a trailing 30-day window (confirmed live — every request further back
 * fails), so this is the only way a month-over-month Instagram comparison
 * stays accurate past 30 days: lib/api/metaGrowth.ts falls back to these
 * stored snapshots once Meta's own live history runs out. Facebook doesn't
 * strictly need this (its `page_follows` insight goes back ~90 days live),
 * but it's captured too for consistency and to extend Facebook's own
 * history past 90 days over time.
 *
 * Same two ways in as the other cron routes: Vercel Cron with CRON_SECRET,
 * or a signed-in admin (for local testing / a manual "capture now").
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
    const audience = await fetchMetaAudienceSnapshot();
    const snapshot = await upsertMetaAudienceSnapshot(localDateIso(), {
      facebookFollowers: audience.facebookFans,
      instagramFollowers: audience.instagramFollowers,
    });
    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "run_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
