import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { getIntegration } from "@/lib/connections/db";
import { getStages } from "@/lib/connections/providers/kommo";

/** Body: { integrationId?, kommoSubdomain, kommoToken? }. A blank token falls back to the saved one. */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const saved = b.integrationId ? await getIntegration(b.integrationId) : null;
  const sub = b.kommoSubdomain || saved?.config.kommoSubdomain;
  const token = b.kommoToken || saved?.secrets.kommoToken;
  if (typeof sub !== "string" || !/^[a-z0-9-]+$/i.test(sub) || !token)
    return Response.json({ error: "Enter the Kommo account name and token first." }, { status: 400 });
  try {
    return Response.json({ stages: await getStages(sub, token) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Kommo request failed" }, { status: 502 });
  }
}
