import { NextRequest, NextResponse } from "next/server";
import { getScheduledMetaPost } from "@/lib/firebase/db";
import { publishScheduledPost } from "@/lib/metaPublisher";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/** Publishes one post right now, regardless of its scheduledFor time — used by the Calendar's "Publish now" button, including retrying a `failed` post. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const post = await getScheduledMetaPost(params.id);
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const published = await publishScheduledPost(post);
    return NextResponse.json(published);
  } catch (err) {
    return NextResponse.json(
      { error: "publish_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
