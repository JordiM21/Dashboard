import { z } from "zod";
import { getMe, sendMessage, TELEGRAM_STEPS } from "../providers/telegram";
import { rateLimited } from "../db";
import type { Integration, RunResult } from "../types";
import type { Flow } from "./types";

const configSchema = z.object({
  telegramChatIds: z.array(z.string().regex(/^-?\d+$/, "Chat IDs are numbers")).min(1),
  heading: z.string().max(80).default(""),
  // Only needed when a web page's own JS calls the address; server-to-server tools send no Origin.
  allowedOrigins: z.array(z.string().url("e.g. https://letjunior.com, no trailing slash")).default([]),
});
const secretsSchema = z.object({ telegramToken: z.string().min(10) });
const cfg = (i: Integration) => configSchema.parse(i.config);
const sec = (i: Integration) => secretsSchema.parse(i.secrets);

const MAX_LINES = 30;
const MAX_LEN = 300;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "unknown error");

/** Pure: JSON, form-encoded or plain text -> "key: value" lines. Nested objects become dot.paths. */
export function linesOf(body: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    data = body.includes("=") && !body.includes("\n") ? Object.fromEntries(new URLSearchParams(body)) : body;
  }
  if (data === null || typeof data !== "object") return String(data ?? "").trim() ? [String(data).slice(0, MAX_LEN * 4)] : [];
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (out.length >= MAX_LINES) return;
    if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    else out.push(`${path || "value"}: ${String(v ?? "-").slice(0, MAX_LEN)}`);
  };
  walk(data, "");
  return out;
}

async function deliver(i: Integration, body: string): Promise<RunResult> {
  const lines = linesOf(body);
  if (!lines.length) return { status: "ignored", detail: "empty body" };
  if (await rateLimited(`any:${i.id}`, 60, 600)) return { status: "error", detail: "rate limited: more than 60 calls in 10 min" };
  const c = cfg(i);
  const text = [`🔔 ${c.heading || i.name}`, ...lines].join("\n");
  const sent = await Promise.allSettled(c.telegramChatIds.map((id) => sendMessage(sec(i).telegramToken, id, text, true)));
  const failed = sent.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) return { status: "error", detail: `${failed.length}/${sent.length} sends failed: ${errMsg(failed[0].reason)}` };
  return { status: "sent", detail: lines[0] };
}

export const flow: Flow = {
  type: "webhook-to-telegram",
  hook: "any",
  label: "Any app → Telegram",
  description: "A general-purpose address: any tool that can send a webhook (Zapier, Make, Stripe, Calendly, Tally, Typeform…) posts to it and you get a Telegram message with every field it sent.",
  needs: ["A Telegram bot and your chat ID", "A tool with a “Webhooks” or “Send to URL” option"],
  steps: [
    ...TELEGRAM_STEPS,
    "Give it a clear name (it becomes the message heading) and press Create integration.",
    "Open it, expand “Inbound address” and copy the address.",
    "In the other tool, look for Webhooks (sometimes called Notifications, Send to URL or HTTP request). Paste the address, method POST, format JSON.",
    "Trigger it once (a test form, a test payment…). Every field arrives as a line in Telegram and the run shows up in Activity.",
    "Only want some events? Filter them in the other tool: this forwards everything it receives.",
  ],
  configSchema,
  secretsSchema,
  defaults: { telegramChatIds: ["8692793778"], heading: "", allowedOrigins: [] },
  fields: [
    { key: "telegramToken", kind: "secret", label: "Telegram bot token", hint: "From @BotFather. Can be the same bot used for other alerts." },
    { key: "telegramChatIds", kind: "config", label: "Telegram chat IDs", hint: "Who gets the alert. Comma-separated numbers.", list: true },
    { key: "heading", kind: "config", label: "Message heading (optional)", hint: "First line of every message. Empty = the integration's name." },
    { key: "allowedOrigins", kind: "config", label: "Allowed website addresses (optional)", hint: "Only if a web page's own code calls this address, e.g. https://letjunior.com. Leave empty for tools like Zapier or Stripe.", list: true },
  ],

  async handle(i, body) {
    return [await deliver(i, body)];
  },

  async test(i, { alert }) {
    try {
      await getMe(sec(i).telegramToken);
    } catch (e) {
      return { ok: false, message: `${errMsg(e)}. Check the bot token, and that you pressed Start on the bot.` };
    }
    if (alert) await deliver(i, JSON.stringify({ event: "test", name: "Maria Lopez", amount: 49, plan: { name: "Junior", months: 3 } }));
    return { ok: true, message: alert ? "Test message sent. Check Telegram." : "Telegram connects." };
  },
};
