import { NextRequest, NextResponse } from "next/server";
import { listWeeklyPlanTags, createWeeklyPlanTag } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Every weekly-plan tag — the tag picker's options list. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const tags = await listWeeklyPlanTags();
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** The tag picker's "+ new tag" — body is `{ name, color }`. Tags are created here first, then attached to plans by id (never freeform text). */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown; color?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color : "";
  if (!name || !color) return NextResponse.json({ error: "invalid_request", message: "name and color are required." }, { status: 400 });

  try {
    const tag = await createWeeklyPlanTag(name, color);
    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
