import { addLog, getIntegration } from "@/lib/connections/db";
import { verifyJob } from "@/lib/connections/jobs";
import { flowByType } from "@/lib/connections/flows/registry";

export const maxDuration = 60;

/**
 * Public but signature-protected: only QStash (which holds the signing key) can call this.
 * Always answers 200 once verified, so QStash never retries and double-sends a reminder.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.text();
  if (!(await verifyJob(req.headers.get("upstash-signature"), body))) return new Response("unauthorized", { status: 401 });

  const i = await getIntegration(params.id).catch(() => null);
  const flow = i && flowByType(i.type);
  if (!i || !flow?.job || !i.enabled) return new Response("ok");

  const payload = JSON.parse(body || "{}");
  for (const r of await flow.job(i, payload)) await addLog(i.id, r).catch(() => {});
  return new Response("ok");
}
