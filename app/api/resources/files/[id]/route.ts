import { NextRequest, NextResponse } from "next/server";
import { updateFile, deleteFile } from "@/lib/resources";
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
  const file = await updateFile(params.id, {
    title: body.title,
    description: body.description,
    tags: body.tags,
    folderId: body.folderId,
  });
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(file);
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

  const ok = await deleteFile(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
