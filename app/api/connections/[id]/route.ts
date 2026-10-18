import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { deleteIntegration, getIntegration, getLogs, saveIntegration } from "@/lib/connections/db";
import { flowByType } from "@/lib/connections/flows/registry";
import { applySchedules } from "@/lib/connections/schedules";
import { publicView } from "@/lib/connections/types";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Detail view: masked record, the inbound address to paste into the other tool, and recent runs. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const i = await getIntegration(params.id);
  const flow = i && flowByType(i.type);
  if (!i || !flow) return Response.json({ error: "not found" }, { status: 404 });
  const origin = new URL(req.url).origin;
  return Response.json({ ...publicView(i), inboundUrl: `${origin}/api/hooks/${flow.hook}/${i.webhookSecret}`, logs: await getLogs(i.id, 20) });
}

/** Partial update. Blank secret fields mean "keep the current value". */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const i = await getIntegration(params.id);
  const flow = i && flowByType(i.type);
  if (!i || !flow) return Response.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const newSecrets = Object.fromEntries(Object.entries(b.secrets ?? {}).filter(([, v]) => v));
  const config = flow.configSchema.safeParse({ ...i.config, ...b.config });
  const secrets = flow.secretsSchema.safeParse({ ...i.secrets, ...newSecrets });
  if (!config.success || !secrets.success)
    return Response.json({ error: "Invalid values", issues: [...(config.error?.issues ?? []), ...(secrets.error?.issues ?? [])] }, { status: 400 });

  const next = {
    ...i,
    name: typeof b.name === "string" && b.name ? b.name : i.name,
    enabled: typeof b.enabled === "boolean" ? b.enabled : i.enabled,
    webhookSecret: b.regenerateSecret ? randomBytes(24).toString("base64url") : i.webhookSecret,
    config: config.data as Record<string, unknown>,
    secrets: secrets.data as Record<string, string>,
    updatedAt: new Date().toISOString(),
  };
  await saveIntegration(next);
  return Response.json({ ...publicView(next), warning: await applySchedules(next) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const i = await getIntegration(params.id);
  if (i) {
    await deleteIntegration(i);
    await applySchedules({ ...i, enabled: false }); // removes its schedules
  }
  return Response.json({ ok: true });
}
