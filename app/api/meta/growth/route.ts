import { NextRequest, NextResponse } from "next/server";
import { fetchPlatformGrowth, fetchBestPosts, currentMonthPeriod, previousMonthPeriod, last3MonthsPeriod } from "@/lib/api/metaGrowth";
import { metaConfigured, MetaApiError } from "@/lib/api/metaCore";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";
import type { Period } from "@/lib/api/metaGrowth";

export const dynamic = "force-dynamic";

const PERIODS: Record<string, () => Period> = {
  "this-month": currentMonthPeriod,
  "last-month": previousMonthPeriod,
  "last-3-months": last3MonthsPeriod,
};

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    throw err;
  }

  if (!metaConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "META_ACCESS_TOKEN isn't set — see lib/api/meta.ts for setup steps." },
      { status: 501 }
    );
  }

  const periodKey = req.nextUrl.searchParams.get("period") ?? "this-month";
  const periodFn = PERIODS[periodKey];
  if (!periodFn) {
    return NextResponse.json(
      { error: "invalid_period", message: `period must be one of: ${Object.keys(PERIODS).join(", ")}` },
      { status: 400 }
    );
  }
  const period = periodFn();

  try {
    const [facebook, instagram, bestPosts] = await Promise.all([
      fetchPlatformGrowth("facebook", period),
      fetchPlatformGrowth("instagram", period),
      fetchBestPosts(period),
    ]);
    return NextResponse.json({ period, facebook, instagram, bestPosts, fetchedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({ error: "meta_api_error", message: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "fetch_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
