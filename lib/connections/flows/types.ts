import type { z } from "zod";
import type { ScheduleSpec } from "../jobs";
import type { Integration, RunResult } from "../types";

/** Drives the dashboard form: one entry per input, no per-integration UI code needed. */
export type Field = {
  key: string;
  kind: "config" | "secret";
  label: string;
  hint: string;
  multiline?: boolean;
  list?: boolean; // config value is string[], edited as comma-separated text
  detect?: "kommo-stages"; // shows a "Detect stages" button that fills a dropdown
};

/** Developer contract: one file in lib/flows/ exporting this, registered in registry.ts. */
export type Flow = {
  type: string; // stored on the integration record
  hook: string; // inbound URL segment: /api/hooks/<hook>/<secret>
  label: string;
  description: string; // one plain-language sentence for non-technical users
  configSchema: z.ZodType;
  secretsSchema: z.ZodType;
  fields: Field[];
  defaults: Record<string, unknown>;
  /** Called after the 200 was already sent. Never throw for downstream failures: return an `error` result.
   * `req` is the original request (only for header access, e.g. Origin/Referer/IP) — undefined when a
   * flow calls this internally (e.g. from `test`), so flows must not require it. */
  handle: (integration: Integration, body: string, req?: Request) => Promise<RunResult[]>;
  test: (integration: Integration, opts: { alert: boolean }) => Promise<{ ok: boolean; message: string }>;
  /** Optional: scheduled / delayed work. Called by /api/jobs/<id> (QStash) and by the dashboard buttons below. */
  job?: (integration: Integration, payload: { job: string; [k: string]: unknown }) => Promise<RunResult[]>;
  /** Optional: recurring schedules to keep in sync on save. cron null = remove. */
  schedules?: (integration: Integration) => ScheduleSpec[];
  /** Optional: extra dashboard buttons that run `job` on demand. */
  actions?: { job: string; label: string }[];
};
