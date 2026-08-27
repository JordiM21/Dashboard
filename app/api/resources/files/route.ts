import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/resources";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { ResourceFile } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const formData = await req.formData();
  const folderIdRaw = formData.get("folderId");
  const folderId = folderIdRaw && folderIdRaw !== "null" ? String(folderIdRaw) : null;
  const entries = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (entries.length === 0) {
    return NextResponse.json({ error: "no files provided" }, { status: 400 });
  }

  const saved: ResourceFile[] = [];
  for (const entry of entries) {
    const buffer = Buffer.from(await entry.arrayBuffer());
    saved.push(await saveFile(buffer, entry.name, entry.type || "application/octet-stream", folderId));
  }

  return NextResponse.json({ files: saved }, { status: 201 });
}
