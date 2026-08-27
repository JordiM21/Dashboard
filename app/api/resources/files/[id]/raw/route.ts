import { NextRequest, NextResponse } from "next/server";
import { getFileRecord, readFileBuffer } from "@/lib/resources";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/** Same-origin raw bytes (not a redirect to the signed Storage URL, unlike /content) — the image "Copy" button fetches through here so the blob it draws into a &lt;canvas&gt; is never cross-origin-tainted. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const record = await getFileRecord(params.id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const buffer = await readFileBuffer(record);
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": record.mimeType } });
}
