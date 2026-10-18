export type Integration = {
  id: string;
  name: string;
  type: string; // matches a flow's `type` in lib/flows/registry.ts
  enabled: boolean;
  webhookSecret: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>; // plaintext in memory, AES-256-GCM encrypted in Redis (see db.ts)
  createdAt: string;
  updatedAt: string;
};

export type RunStatus = "sent" | "ignored" | "duplicate" | "error";

/** What a flow returns per event; db.addLog adds id / integrationId / at. */
export type RunResult = { status: RunStatus; leadId?: string; detail?: string };

export type RunLog = RunResult & { id: string; integrationId: string; at: string };

/** Safe for the browser: secrets reduced to ••••last4. */
export const publicView = (i: Integration) => ({
  ...i,
  secrets: Object.fromEntries(
    Object.entries(i.secrets).map(([k, v]) => [k, "••••" + v.slice(-4)]),
  ),
});
