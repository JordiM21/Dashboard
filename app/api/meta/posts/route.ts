import { NextRequest, NextResponse } from "next/server";
import { fetchFacebookPosts, fetchInstagramPosts, fetchMetaAudienceSnapshot } from "@/lib/api/metaContent";
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

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "12");
  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  const until = req.nextUrl.searchParams.get("until") ?? undefined;

  try {
    const [facebook, instagram, audience] = await Promise.all([
      fetchFacebookPosts({ limit, since, until }),
      fetchInstagramPosts({ limit, since, until }),
      fetchMetaAudienceSnapshot(),
    ]);
    const posts = [...facebook, ...instagram].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ posts, audience, fetchedAt: new Date().toISOString() });
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
