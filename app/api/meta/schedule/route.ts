import { NextRequest, NextResponse } from "next/server";
import { createScheduledMetaPost } from "@/lib/firebase/db";
import { publishScheduledPost } from "@/lib/metaPublisher";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = ["facebook", "instagram", "both"];

/**
 * Creates a scheduled post. If `scheduledFor` is now-or-past, publishes it
 * immediately in the same request instead of waiting for the next cron
 * run/manual trigger — so picking "now" in the Calendar behaves like a
 * normal "post" button, not a schedule-and-wait.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    throw err;
  }

  const body = await req.json();

  if (!VALID_PLATFORMS.includes(body?.platform)) {
    return NextResponse.json({ error: "invalid_body", message: "platform must be facebook, instagram, or both." }, { status: 400 });
  }
  if (!body?.caption?.trim()) {
    return NextResponse.json({ error: "invalid_body", message: "caption is required." }, { status: 400 });
  }
  if (!body?.scheduledFor) {
    return NextResponse.json({ error: "invalid_body", message: "scheduledFor is required." }, { status: 400 });
  }
  if ((body.platform === "instagram" || body.platform === "both") && !body?.mediaUrl?.trim()) {
    return NextResponse.json(
      { error: "invalid_body", message: "Instagram requires a mediaUrl — it doesn't support text-only posts." },
      { status: 400 }
    );
  }

  try {
    let post = await createScheduledMetaPost({
      platform: body.platform,
      caption: body.caption.trim(),
      ...(body.mediaUrl?.trim() ? { mediaUrl: body.mediaUrl.trim() } : {}),
      ...(body.linkUrl?.trim() ? { linkUrl: body.linkUrl.trim() } : {}),
      scheduledFor: body.scheduledFor,
      status: "scheduled",
    });

    if (new Date(post.scheduledFor).getTime() <= Date.now()) {
      post = await publishScheduledPost(post);
    }

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "create_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
