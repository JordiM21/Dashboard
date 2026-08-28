import { NextRequest, NextResponse } from "next/server";
import { updateGame, deleteGame } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { GameDoc } from "@/lib/types";

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
  const { frontmatter } = body as { frontmatter: Partial<GameDoc> };
  const game = await updateGame(params.id, frontmatter);
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(game);
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

  const ok = await deleteGame(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
