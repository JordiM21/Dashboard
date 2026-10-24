import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { deleteMedia, deletePost, getPost, savePost } from "@/lib/social/publish";
import { EDITABLE, type SocialPost } from "@/lib/social/rules";
import { parseInput, schedule, withUrls } from "../../input";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const old = await getPost(params.id);
  if (!old) return Response.json({ error: "Post not found." }, { status: 404 });
  if (!EDITABLE.includes(old.status)) return Response.json({ error: `This post is ${old.status} and can't be changed.` }, { status: 409 });
  const input = parseInput(await req.json().catch(() => null));
  if (input instanceof Response) return input;

  // Platforms that already went out stay out; a failed post retries only the rest.
  const p: SocialPost = { ...old, ...input, status: input.scheduledAt ? "scheduled" : "draft", updatedAt: new Date().toISOString() };
  for (const k of Object.keys(p.results) as (keyof SocialPost["results"])[]) if (p.results[k]?.error) delete p.results[k];
  await savePost(p);
  const gone = old.media.filter((m) => !p.media.some((n) => n.path === m.path)).map((m) => m.path);
  if (gone.length) await deleteMedia(gone);
  return Response.json({ post: await withUrls(p), warning: await schedule(p) });
}

/** Removes it from the calendar only — anything already published stays on Facebook/Instagram. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const p = await getPost(params.id);
  if (p?.status === "publishing") return Response.json({ error: "It's publishing right now. Try again in a minute." }, { status: 409 });
  await deletePost(params.id);
  if (p) await deleteMedia(p.media.map((m) => m.path));
  return new Response(null, { status: 204 });
}
