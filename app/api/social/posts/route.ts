import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { listPosts, savePost } from "@/lib/social/publish";
import type { SocialPost } from "@/lib/social/rules";
import { parseInput, schedule, withUrls } from "../input";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  return Response.json(await Promise.all((await listPosts()).map(withUrls)));
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const input = parseInput(await req.json().catch(() => null));
  if (input instanceof Response) return input;
  const now = new Date().toISOString();
  const p: SocialPost = { ...input, id: `sp_${randomUUID().slice(0, 12)}`, status: input.scheduledAt ? "scheduled" : "draft", results: {}, createdAt: now, updatedAt: now };
  await savePost(p);
  return Response.json({ post: await withUrls(p), warning: await schedule(p) }, { status: 201 });
}
