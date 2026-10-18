import { waitUntil } from "@vercel/functions";
import { addLog, getBySecret } from "@/lib/connections/db";
import { corsHeaders } from "@/lib/connections/cors";
import { flowByHook } from "@/lib/connections/flows/registry";

export const maxDuration = 30;

type Ctx = { params: { type: string; secret: string } };

/** Preflight for browser-called flows (website forms); a no-op response for everything else. */
export async function OPTIONS(req: Request, { params }: Ctx) {
  const { type, secret } = params;
  const flow = flowByHook(type);
  const integration = flow ? await getBySecret(secret).catch(() => null) : null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin"), integration?.config.allowedOrigins) });
}

/**
 * Public inbound endpoint for every integration: /api/hooks/<flow.hook>/<webhookSecret>.
 * Always answers 200 fast (Kommo disables webhooks that keep failing); real work runs after the response.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { type, secret } = params;
  const body = await req.text();
  const flow = flowByHook(type);
  const integration = flow ? await getBySecret(secret).catch(() => null) : null;
  const headers = corsHeaders(req.headers.get("origin"), integration?.config.allowedOrigins);

  if (flow && integration?.enabled && integration.type === flow.type) {
    waitUntil((async () => {
      try {
        for (const r of await flow.handle(integration, body, req)) await addLog(integration.id, r);
      } catch (e) {
        await addLog(integration.id, { status: "error", detail: e instanceof Error ? e.message : "unknown error" }).catch(() => {});
      }
    })());
  }
  return new Response("ok", { headers });
}
