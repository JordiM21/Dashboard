import { NextRequest, NextResponse } from "next/server";
import { updateFolder, deleteFolder } from "@/lib/resources";
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
  const ok = await updateFolder(params.id, { name: body.name, parentId: body.parentId });
  if (!ok) return NextResponse.json({ error: "not_found_or_invalid_move" }, { status: 400 });
  return NextResponse.json({ ok: true });
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

  const ok = await deleteFolder(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
