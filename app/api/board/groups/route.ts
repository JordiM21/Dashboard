import { NextRequest, NextResponse } from "next/server";
import { listGroups, isRecallDue, createGroup } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";
import { localDateIso } from "@/lib/dateUtils";
import type { GroupDocWithRecall } from "@/lib/types";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Every group's current curriculum placement, plus a `reviewSuggested` flag (their latest "Mastered" history entry is 90+ days old) — the Curriculum Board's pills. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const groups = await listGroups();
    const today = localDateIso();
    const withRecall: GroupDocWithRecall[] = await Promise.all(
      groups.map(async (g) => ({ ...g, reviewSuggested: await isRecallDue(g.id, today) }))
    );
    return NextResponse.json({ groups: withRecall });
  } catch (err) {
    return NextResponse.json(
      { error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

/** The Curriculum Board's "+ New Group" button — body is `{ name }`. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "invalid_request", message: "name is required." }, { status: 400 });

  try {
    const group = await createGroup(name);
    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
