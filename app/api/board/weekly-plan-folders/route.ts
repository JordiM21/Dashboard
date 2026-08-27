import { NextRequest, NextResponse } from "next/server";
import { listWeeklyPlanFolders, createWeeklyPlanFolder } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Every weekly-plan folder, in display order — the Teaching sidebar's "Weekly Plans" queue sections. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const folders = await listWeeklyPlanFolders();
    return NextResponse.json({ folders });
  } catch (err) {
    return NextResponse.json({ error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** The sidebar's "+ Add Folder" button — body is `{ name }`. */
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
    const folder = await createWeeklyPlanFolder(name);
    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
