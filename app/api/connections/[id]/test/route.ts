import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { addLog, getIntegration } from "@/lib/connections/db";
import { flowByType } from "@/lib/connections/flows/registry";

export const maxDuration = 30;

/** Body: { alert?: boolean, job?: string }. Tests connections; alert=true also sends a sample message; job runs a flow action now. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const i = await getIntegration(params.id);
  const flow = i && flowByType(i.type);
  if (!i || !flow) return Response.json({ ok: false, message: "Integration not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.job) {
    if (!flow.job) return Response.json({ ok: false, message: "This integration has no such action" });
    const results = await flow.job(i, { job: String(b.job), manual: true });
    for (const r of results) await addLog(i.id, r).catch(() => {});
    return Response.json({ ok: results.every((r) => r.status !== "error"), message: results.map((r) => r.detail).filter(Boolean).join(" · ") || "Done" });
  }
  return Response.json(await flow.test(i, { alert: !!b.alert }));
}
