import { NextRequest, NextResponse } from "next/server";
import { fetchAllKommoLeadsDetailed, fetchKommoPipelines } from "@/lib/api/kommo";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const [leads, pipelines] = await Promise.all([fetchAllKommoLeadsDetailed(), fetchKommoPipelines()]);
    return NextResponse.json({ leads, pipelines });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error fetching Kommo data" },
      { status: 502 }
    );
  }
}
