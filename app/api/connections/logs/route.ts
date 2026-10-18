import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { allLogs } from "@/lib/connections/db";

export const dynamic = "force-dynamic";

/** Newest-first run feed across every integration; ?status=sent|ignored|duplicate|error narrows it. */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  return Response.json(await allLogs(req.nextUrl.searchParams.get("status") || undefined));
}
