import { NextRequest, NextResponse } from "next/server";
import { createFolder } from "@/lib/resources";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const folder = await createFolder(name, body.parentId ?? null);
  return NextResponse.json(folder, { status: 201 });
}
