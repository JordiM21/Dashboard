import { NextRequest, NextResponse } from "next/server";
import { updateScheduledMetaPost, deleteScheduledMetaPost } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/** Edits a still-`scheduled` post — caption, media, or when it goes out. Once it's `publishing`/`published`/`failed` this is for record-keeping only (the platform posts, once live, aren't rewritten from here). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.caption !== undefined) updates.caption = body.caption;
  if (body.mediaUrl !== undefined) updates.mediaUrl = body.mediaUrl;
  if (body.linkUrl !== undefined) updates.linkUrl = body.linkUrl;
  if (body.scheduledFor !== undefined) updates.scheduledFor = body.scheduledFor;
  if (body.platform !== undefined) updates.platform = body.platform;

  const post = await updateScheduledMetaPost(params.id, updates);
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(post);
}

/** Cancels a scheduled (not-yet-published) post. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const ok = await deleteScheduledMetaPost(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
