import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { claim, getPost, publishPost } from "@/lib/social/publish";
import { EDITABLE } from "@/lib/social/rules";
import { parseInput, withUrls } from "../../../input";

export const maxDuration = 60;

/** "Publish now" from the composer. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const old = await getPost(params.id);
  if (!old) return Response.json({ error: "Post not found." }, { status: 404 });
  const bad = parseInput(old, { publishing: true });
  if (bad instanceof Response) return bad;
  const p = await claim(params.id, EDITABLE);
  if (!p) return Response.json({ error: `This post is already ${old.status}.` }, { status: 409 });
  return Response.json({ post: await withUrls(await publishPost(p)) });
}
