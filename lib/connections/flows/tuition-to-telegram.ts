import { z } from "zod";
import { sendMessage, getMe } from "../providers/telegram";
import { render, SAMPLE } from "../template";
import type { Integration, RunResult } from "../types";
import type { Flow } from "./types";

const configSchema = z.object({
  telegramChatIds: z.array(z.string().regex(/^-?\d+$/, "Chat IDs are numbers")).min(1),
  messageTemplate: z.string().min(1).max(2000),
});
const secretsSchema = z.object({ telegramToken: z.string().min(10) });
const cfg = (i: Integration) => configSchema.parse(i.config);
const sec = (i: Integration) => secretsSchema.parse(i.secrets);

// What your dashboard app POSTs as JSON to /api/hooks/tuition/<secret>.
const payloadSchema = z.object({
  studentName: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  dueDate: z.string().min(1),
  status: z.string().optional(), // e.g. "due" | "overdue" | "paid" — free text, shown as-is
});

const DEFAULT_TEMPLATE = `💳 Recordatorio de matrícula
Estudiante: {{student}}
Importe: {{amount}}
Vence: {{due}}
Estado: {{status}}`;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "unknown error");

async function handleOne(i: Integration, body: unknown): Promise<RunResult> {
  const p = payloadSchema.safeParse(body);
  if (!p.success) return { status: "error", detail: `bad payload: ${p.error.issues.map((x) => x.message).join(", ")}` };

  const c = cfg(i);
  const s = sec(i);
  const text = render(c.messageTemplate, {
    student: p.data.studentName,
    amount: String(p.data.amount),
    due: p.data.dueDate,
    status: p.data.status,
  });
  const sent = await Promise.allSettled(c.telegramChatIds.map((id) => sendMessage(s.telegramToken, id, text)));
  const failed = sent.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  return failed.length
    ? { status: "error", detail: `${failed.length}/${sent.length} sends failed: ${errMsg(failed[0].reason)}` }
    : { status: "sent", detail: p.data.studentName };
}

export const flow: Flow = {
  type: "tuition-to-telegram",
  hook: "tuition",
  label: "Student tuition reminders",
  description: "Your dashboard app sends student, amount and due date; you get a Telegram message.",
  configSchema,
  secretsSchema,
  defaults: { messageTemplate: DEFAULT_TEMPLATE, telegramChatIds: ["8692793778"] },
  fields: [
    { key: "telegramToken", kind: "secret", label: "Telegram bot token", hint: "From @BotFather. Can be the same bot used for other alerts." },
    { key: "telegramChatIds", kind: "config", label: "Telegram chat IDs", hint: "Who gets the alert. Comma-separated numbers.", list: true },
    { key: "messageTemplate", kind: "config", label: "Message text", hint: "You can use {{student}} {{amount}} {{due}} {{status}}.", multiline: true },
  ],

  // Body is JSON, one reminder per request: { studentName, amount, dueDate, status? }
  async handle(i, body) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return [{ status: "error", detail: "body is not valid JSON" }];
    }
    return [await handleOne(i, json)];
  },

  async test(i, { alert }) {
    const s = sec(i);
    try {
      await getMe(s.telegramToken);
      if (alert) await handleOne(i, { studentName: "Ana Pérez", amount: "50€", dueDate: "2026-10-01", status: "due" });
    } catch (e) {
      return { ok: false, message: `${errMsg(e)}. Check the bot token, and that you pressed Start on the bot.` };
    }
    return { ok: true, message: alert ? "Test reminder sent. Check Telegram." : "Telegram connects." };
  },
};
