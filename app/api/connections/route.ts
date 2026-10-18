import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { denyUnlessAuthed } from "@/lib/firebase/verifyAuth";
import { getLogs, listIntegrations, saveIntegration } from "@/lib/connections/db";
import { flowByType, flows } from "@/lib/connections/flows/registry";
import { applySchedules } from "@/lib/connections/schedules";
import { publicView, type Integration } from "@/lib/connections/types";

export const dynamic = "force-dynamic";

/** Every integration with its latest run, plus the flow catalogue the form is built from. */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const integrations = await Promise.all(
    (await listIntegrations()).map(async (i) => ({ ...publicView(i), last: (await getLogs(i.id, 1))[0] ?? null })),
  );
  return Response.json({
    integrations,
    flows: flows.map(({ type, label, description, fields, defaults, actions }) => ({ type, label, description, fields, defaults, actions: actions ?? [] })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const flow = flowByType(b.type);
  if (!flow || !b.name) return Response.json({ error: "Unknown type or missing name" }, { status: 400 });

  const config = flow.configSchema.safeParse(b.config);
  const secrets = flow.secretsSchema.safeParse(b.secrets);
  if (!config.success || !secrets.success)
    return Response.json({ error: "Invalid values", issues: [...(config.error?.issues ?? []), ...(secrets.error?.issues ?? [])] }, { status: 400 });

  const now = new Date().toISOString();
  const i: Integration = {
    id: `int_${randomUUID().slice(0, 8)}`,
    name: String(b.name),
    type: flow.type,
    enabled: true,
    webhookSecret: randomBytes(24).toString("base64url"),
    config: config.data as Record<string, unknown>,
    secrets: secrets.data as Record<string, string>,
    createdAt: now,
    updatedAt: now,
  };
  await saveIntegration(i);
  return Response.json({ ...publicView(i), warning: await applySchedules(i) }, { status: 201 });
}
