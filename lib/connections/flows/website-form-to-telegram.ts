import { z } from "zod";
import { getMe, sendMessage, TELEGRAM_STEPS } from "../providers/telegram";
import { checkToken, upsertWebLead } from "../providers/kommo";
import { rateLimited } from "../db";
import type { Integration, RunResult } from "../types";
import type { Flow } from "./types";

const configSchema = z.object({
  telegramChatIds: z.array(z.string().regex(/^-?\d+$/, "Chat IDs are numbers")).min(1),
  // The webhook URL is public (it's called from the visitor's browser), so it can't stay secret.
  // This is real protection: without it, no CORS headers are sent and browsers refuse the request.
  allowedOrigins: z.array(z.string().url("e.g. https://letjunior.com, no trailing slash")).min(1),
  // Optional: also create the lead in Kommo. Empty subdomain = Telegram only (integrations saved before this keep working).
  kommoSubdomain: z.string().regex(/^[a-z0-9-]*$/i, "Only the name before .kommo.com").default(""),
  kommoStatusId: z.string().regex(/^\d*$/, "Pick a stage").default(""),
  kommoTag: z.string().max(50).default("web_quiz"),
});
const secretsSchema = z.object({
  telegramToken: z.string().min(10),
  kommoToken: z.union([z.literal(""), z.string().min(10)]).optional(),
});
const cfg = (i: Integration) => configSchema.parse(i.config);
const sec = (i: Integration) => secretsSchema.parse(i.secrets);

// What the website's own JS sends. Flat object: any field names, always the same shape per form.
// _form is an optional heading, _hp is a honeypot (real visitors never fill it in).
const RESERVED = ["_form", "_hp"];
const MAX_FIELDS = 30;
const MAX_LEN = 500;
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]).optional();
const payloadSchema = z
  .record(z.string(), primitive)
  .refine((o) => Object.keys(o).filter((k) => !RESERVED.includes(k)).length > 0, "no form fields in the payload")
  .refine((o) => Object.keys(o).length <= MAX_FIELDS, `more than ${MAX_FIELDS} fields`);
type Payload = Record<string, string | number | boolean | null | undefined>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "unknown error");
const clip = (v: unknown) => String(v ?? "").slice(0, MAX_LEN);

/** Best-effort "which page sent this" from standard headers; never required from the form itself. */
const pageFrom = (req: Request | undefined) => req?.headers.get("referer") || req?.headers.get("origin") || undefined;

/** Pure: payload -> Telegram text, or null if it's spam (honeypot filled in). Exported for testing without a network call. */
export function formatSubmission(data: Payload, page: string | undefined) {
  if (clip(data._hp)) return null; // never tell the bot it was caught
  const lines = Object.entries(data)
    .filter(([k]) => !RESERVED.includes(k))
    .map(([k, v]) => `${k}: ${clip(v) || "-"}`);
  const heading = clip(data._form) || "Nuevo formulario";
  return { heading, text: [`📝 ${heading}`, ...lines, ...(page ? [`Página: ${page}`] : [])].join("\n") };
}

/** Pure: who to put in Kommo. Field names as the website sends them (accents/case don't matter). No phone = skip Kommo. */
export function contactOf(data: Payload) {
  const pick = (...keys: string[]) => {
    const k = Object.keys(data).find((x) => keys.includes(x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()));
    return k ? clip(data[k]).trim() : "";
  };
  const phone = pick("telefono", "phone", "whatsapp");
  return phone.replace(/\D/g, "").length >= 7 ? { name: pick("nombre", "name") || "Sin nombre", phone } : null;
}

async function handleOne(i: Integration, body: unknown, req: Request | undefined): Promise<RunResult> {
  const p = payloadSchema.safeParse(body);
  if (!p.success) return { status: "error", detail: `bad payload: ${p.error.issues[0]?.message ?? "invalid"}` };

  const msg = formatSubmission(p.data, pageFrom(req));
  if (!msg) return { status: "ignored", detail: "spam: honeypot field was filled in" };

  const c = cfg(i);
  const s = sec(i);

  const ip = req?.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (await rateLimited(`form:${i.id}:${ip}`, 10, 600)) return { status: "error", detail: `rate limited: ${ip}` };

  // Kommo first, so the Telegram alert can link straight to the lead. A Kommo failure never blocks the alert.
  let kommoLine = "", kommoErr = "", leadId: string | undefined;
  const who = contactOf(p.data);
  if (c.kommoSubdomain && s.kommoToken && who) {
    try {
      const r = await upsertWebLead(c.kommoSubdomain, s.kommoToken, {
        ...who,
        tag: c.kommoTag || "web_quiz",
        statusId: Number(c.kommoStatusId) || 0,
        note: msg.text,
      });
      leadId = String(r.leadId);
      kommoLine = `\n🗂️ Kommo${r.reused ? " (lead ya abierto)" : ""}: https://${c.kommoSubdomain}.kommo.com/leads/detail/${r.leadId}`;
    } catch (e) {
      kommoErr = errMsg(e);
      kommoLine = `\n⚠️ No se pudo crear en Kommo: ${kommoErr.slice(0, 150)}`;
    }
  }

  const sent = await Promise.allSettled(c.telegramChatIds.map((id) => sendMessage(s.telegramToken, id, msg.text + kommoLine)));
  const failed = sent.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) return { status: "error", leadId, detail: `${failed.length}/${sent.length} sends failed: ${errMsg(failed[0].reason)}` };
  return kommoErr ? { status: "error", detail: `Telegram sent, Kommo failed: ${kommoErr}` } : { status: "sent", leadId, detail: msg.heading };
}

export const flow: Flow = {
  type: "website-form-to-telegram",
  hook: "form",
  label: "Website form to Telegram (+ Kommo)",
  description: "Your website's form posts straight from the visitor's browser; you get a Telegram message with whatever fields it sent, and optionally the lead is created in Kommo.",
  needs: ["A Telegram bot and your chat ID", "Access to the website's code", "Optional: a Kommo token that can create leads"],
  steps: [
    ...TELEGRAM_STEPS,
    "Allowed website addresses: your site exactly as it appears in the browser, e.g. https://letjunior.com, https://www.letjunior.com.",
    "Press Create integration, open it, expand “Inbound address” and copy the address.",
    "In the website's form script, send the fields as JSON: fetch(address, { method: \"POST\", body: JSON.stringify({ Nombre, Telefono, … }) }). Add _form for a heading, and a hidden _hp field as a spam trap (cupo.js already does this).",
    "Optional, Kommo: fill in the account name and token, press Detect stages and pick where new leads land. Leads need a phone number to be created.",
    "Submit the real form once and check Telegram and Activity.",
  ],
  configSchema,
  secretsSchema,
  defaults: { telegramChatIds: ["8692793778"], allowedOrigins: [], kommoSubdomain: "", kommoStatusId: "", kommoTag: "web_quiz" },
  fields: [
    { key: "telegramToken", kind: "secret", label: "Telegram bot token", hint: "From @BotFather. Can be the same bot used for other alerts." },
    { key: "telegramChatIds", kind: "config", label: "Telegram chat IDs", hint: "Who gets the alert. Comma-separated numbers.", list: true },
    { key: "allowedOrigins", kind: "config", label: "Allowed website addresses", hint: "Comma-separated, e.g. https://letjunior.com, https://www.letjunior.com. Only these sites' browsers can call this (no trailing slash).", list: true },
    { key: "kommoSubdomain", kind: "config", label: "Kommo account name (optional)", hint: "The part before .kommo.com. Leave empty to only send Telegram alerts." },
    { key: "kommoToken", kind: "secret", label: "Kommo token (optional)", hint: "Long-lived token from your Kommo private integration. It needs permission to create contacts and leads." },
    { key: "kommoStatusId", kind: "config", label: "Kommo stage for new web leads", hint: "Where new leads land. Put your Salesbot (Utility template) on this stage.", detect: "kommo-stages" },
    { key: "kommoTag", kind: "config", label: "Kommo tag", hint: "Added to every web lead, e.g. web_quiz." },
  ],

  // Body is JSON: a flat object of whatever fields the form has, e.g. { "Nombre": "...", "Email": "..." }.
  async handle(i, body, req) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return [{ status: "error", detail: "body is not valid JSON" }];
    }
    return [await handleOne(i, json, req)];
  },

  // The test alert has no phone, so it never creates anything in Kommo; it only checks the Kommo token works.
  async test(i, { alert }) {
    const c = cfg(i);
    const s = sec(i);
    try {
      await getMe(s.telegramToken);
    } catch (e) {
      return { ok: false, message: `${errMsg(e)}. Check the bot token, and that you pressed Start on the bot.` };
    }
    if (c.kommoSubdomain && s.kommoToken) {
      try {
        await checkToken(c.kommoSubdomain, s.kommoToken);
      } catch (e) {
        return { ok: false, message: `Telegram works, Kommo doesn't: ${errMsg(e)}` };
      }
    }
    if (alert) await handleOne(i, { _form: "Prueba", Nombre: "Visitante de prueba", Email: "prueba@example.com" }, undefined);
    const kommo = c.kommoSubdomain && s.kommoToken ? " Kommo connects too." : "";
    return { ok: true, message: (alert ? "Test message sent. Check Telegram." : "Telegram connects.") + kommo };
  },
};
