import { NextRequest, NextResponse } from "next/server";
import { updateContent, deleteContent } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { ContentItem } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { frontmatter, content } = body as { frontmatter: Partial<ContentItem>; content: string };
  const item = await updateContent(params.id, { ...frontmatter, content });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(item);
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

  const ok = await deleteContent(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
