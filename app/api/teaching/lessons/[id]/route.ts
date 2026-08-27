import { NextRequest, NextResponse } from "next/server";
import { renameLessonFile, deleteLessonFile } from "@/lib/teaching";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "invalid_body", message: "title is required." }, { status: 400 });
  }

  const lesson = await renameLessonFile(params.id, body.title.trim());
  if (!lesson) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(lesson);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const ok = await deleteLessonFile(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
