import { NextRequest, NextResponse } from "next/server";
import { fetchRecentLeads } from "@/lib/api/metaLeads";
import { metaConfigured, MetaApiError } from "@/lib/api/metaCore";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

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

  try {
    const leads = await fetchRecentLeads();
    return NextResponse.json({ leads, fetchedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof MetaApiError) {
      // leads_retrieval is a restricted permission — a 403 here almost always means it hasn't been granted by App Review yet.
      return NextResponse.json({ error: "meta_api_error", message: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "fetch_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
