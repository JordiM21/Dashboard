import { NextRequest, NextResponse } from "next/server";
import { fetchRecentComments, fetchPostComments, replyToComment, setCommentHidden, deleteComment } from "@/lib/api/metaContent";
import { metaConfigured, MetaApiError } from "@/lib/api/metaCore";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  try {
    await requireAuth(req);
    return null;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    throw err;
  }
}

function metaErrorResponse(err: unknown) {
  if (err instanceof MetaApiError) {
    return NextResponse.json({ error: "meta_api_error", message: err.message }, { status: err.status });
  }
  return NextResponse.json(
    { error: "request_failed", message: err instanceof Error ? err.message : "Unknown error" },
    { status: 502 }
  );
}

/** ?postId=&platform= for one post's thread, or no params for a rollup across recent posts on both platforms. */
export async function GET(req: NextRequest) {
  const authError = await checkAuth(req);
  if (authError) return authError;

  if (!metaConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "META_ACCESS_TOKEN isn't set — see lib/api/meta.ts for setup steps." },
      { status: 501 }
    );
  }

  const postId = req.nextUrl.searchParams.get("postId");
  const platform = req.nextUrl.searchParams.get("platform") as "facebook" | "instagram" | null;

  try {
    const comments = postId && platform ? await fetchPostComments(postId, platform) : await fetchRecentComments();
    return NextResponse.json({ comments, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return metaErrorResponse(err);
  }
}

/** Reply to, hide/unhide, or delete a comment — { action: "reply"|"hide"|"unhide"|"delete", commentId, platform, message? }. */
export async function POST(req: NextRequest) {
  const authError = await checkAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { action, commentId, platform } = body ?? {};
  if (!commentId || !platform) {
    return NextResponse.json({ error: "invalid_body", message: "commentId and platform are required." }, { status: 400 });
  }

  try {
    if (action === "reply") {
      if (!body.message?.trim()) {
        return NextResponse.json({ error: "invalid_body", message: "message is required to reply." }, { status: 400 });
      }
      const reply = await replyToComment(commentId, platform, body.message.trim());
      return NextResponse.json(reply, { status: 201 });
    }
    if (action === "hide" || action === "unhide") {
      await setCommentHidden(commentId, platform, action === "hide");
      return NextResponse.json({ ok: true });
    }
    if (action === "delete") {
      await deleteComment(commentId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid_body", message: "action must be reply, hide, unhide, or delete." }, { status: 400 });
  } catch (err) {
    return metaErrorResponse(err);
  }
}
