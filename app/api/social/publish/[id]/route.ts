import { verifyJob } from "@/lib/connections/jobs";
import { claim, enqueue, getPost, publishPost } from "@/lib/social/publish";

export const maxDuration = 60;

/**
 * QStash calls this at a post's scheduled time (signature-protected). Always 200 once verified, so QStash
 * never retries into a double post. Ignores messages for a time the post no longer has (it was rescheduled).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.text();
  if (!(await verifyJob(req.headers.get("upstash-signature"), body))) return new Response("unauthorized", { status: 401 });
  const { at, retry } = JSON.parse(body || "{}") as { at?: string; retry?: boolean };

  const post = await getPost(params.id);
  if (!post || (post.scheduledAt ?? null) !== (at ?? null)) return new Response("ok");

  if (retry) {
    // ponytail: retries aren't claimed; only one is ever queued per processing post.
    if (post.status === "publishing" && post.igContainer) await publishPost(post);
    return new Response("ok");
  }
  if (post.status !== "scheduled" || !post.scheduledAt) return new Response("ok");
  if (Date.parse(post.scheduledAt) - Date.now() > 60_000) {
    await enqueue(post); // still far off: hop again (QStash max delay)
    return new Response("ok");
  }
  const p = await claim(post.id, ["scheduled"]);
  if (p) await publishPost(p);
  return new Response("ok");
}
