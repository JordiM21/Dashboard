import { z } from "zod";
import { claimDedupe } from "../db";
import { delayJob } from "../jobs";
import { checkToken, getContact, getEvents, getEventsFor, getLead, getUsers } from "../providers/kommo";
import { getMe, sendMessage, TELEGRAM_STEPS } from "../providers/telegram";
import { compute, format, handoffTimes, isHumanReply, type LeadInfo } from "../summary";
import { DEFAULT_TEMPLATE, render, SAMPLE } from "../template";
import type { Integration, RunResult } from "../types";
import type { Flow } from "./types";

const validZone = (z: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return true;
  } catch {
    return false;
  }
};

const configSchema = z.object({
  kommoSubdomain: z.string().regex(/^[a-z0-9-]+$/i, "Only the name before .kommo.com"),
  handoffStatusId: z.string().regex(/^\d+$/, "Pick a stage"),
  telegramChatIds: z.array(z.string().regex(/^-?\d+$/, "Chat IDs are numbers")).min(1),
  messageTemplate: z.string().min(1).max(2000),
  // Optional features. Defaults apply to integrations saved before these existed.
  reminderMinutes: z.string().regex(/^\d{1,4}$/, "A number of minutes, 0 = off").default("0"),
  summaryHour: z.string().regex(/^(\d|1\d|2[0-3])?$/, "0-23, or empty = off").default("0"),
  timezone: z.string().refine(validZone, "Unknown time zone, e.g. Europe/Madrid").default("Europe/Madrid"),
});
const secretsSchema = z.object({
  kommoToken: z.string().min(10),
  telegramToken: z.string().min(10),
});
const cfg = (i: Integration) => configSchema.parse(i.config);
const sec = (i: Integration) => secretsSchema.parse(i.secrets);

/**
 * Kommo sends form-encoded bracket keys: leads[status][0][id]=1&leads[status][0][status_id]=2 ...
 * ponytail: key names come from the docs; confirm against a real delivery (see console.log below).
 */
export function parseLeads(body: string) {
  const byIndex = new Map<string, Record<string, string>>();
  for (const [k, v] of new URLSearchParams(body)) {
    const m = k.match(/^leads\[status\]\[(\d+)\]\[(\w+)\]$/);
    if (m) byIndex.set(m[1], { ...byIndex.get(m[1]), [m[2]]: v });
  }
  return [...byIndex.values()].filter((l) => l.id);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "unknown error");
const HUMAN_ACTIONS = ["outgoing_chat_message", "outgoing_call"];

/** "[chat_message by 0 +312s]": who Kommo says sent each event and how long after the handoff. For debugging "person or bot?". */
const diag = (events: { type: string; created_by: number; created_at: number }[], since: number) =>
  `[${events.slice(0, 5).map((e) => `${e.type.replace("outgoing_", "")} by ${e.created_by} +${e.created_at - since}s`).join(", ")}]`;

/** Runs fn over items, `n` at a time (Kommo allows ~7 requests/second). */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

async function handleLead(i: Integration, lead: Record<string, string>): Promise<RunResult> {
  const c = cfg(i);
  const s = sec(i);
  const leadId = lead.id;

  if (lead.status_id !== c.handoffStatusId) return { status: "ignored", leadId, detail: `stage ${lead.status_id}` };
  if (!(await claimDedupe(`${i.id}:${leadId}:${lead.status_id}`))) return { status: "duplicate", leadId };

  const vars: Parameters<typeof render>[1] = {
    lead: undefined, contact: undefined, phone: undefined, tags: undefined,
    link: `https://${c.kommoSubdomain}.kommo.com/leads/detail/${leadId}`,
  };
  let note = "";
  try {
    const l = await getLead(c.kommoSubdomain, s.kommoToken, leadId);
    vars.lead = l.name;
    vars.tags = l.tags.join(", ");
    if (l.contactId) {
      const ct = await getContact(c.kommoSubdomain, s.kommoToken, l.contactId);
      vars.contact = ct.name;
      vars.phone = ct.phone;
    }
  } catch (e) {
    note = `reduced alert: ${errMsg(e)}`; // a human must still be told
    vars.lead ||= `#${leadId}`;
  }

  const text = render(c.messageTemplate, vars);
  const sent = await Promise.allSettled(c.telegramChatIds.map((id) => sendMessage(s.telegramToken, id, text)));
  const failed = sent.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) return { status: "error", leadId, detail: `${failed.length}/${sent.length} sends failed: ${errMsg(failed[0].reason)}` };

  // Alert delivered: schedule the "nobody answered" check. A failure here must never hide the alert.
  const minutes = Number(c.reminderMinutes);
  if (minutes > 0) {
    try {
      await delayJob(i.id, { job: "reminder", leadId, handoffAt: Math.floor(Date.now() / 1000) }, minutes * 60);
    } catch (e) {
      note += `${note ? "; " : ""}reminder not scheduled: ${errMsg(e)}`;
    }
  }
  return { status: "sent", leadId, detail: note || undefined };
}

/** Fires `reminderMinutes` after the alert. Silent if the lead moved on or a human already replied. */
async function reminder(i: Integration, p: Record<string, unknown>): Promise<RunResult> {
  const c = cfg(i);
  const s = sec(i);
  const leadId = String(p.leadId);
  const handoffAt = Number(p.handoffAt);
  if (Number(c.reminderMinutes) === 0) return { status: "ignored", leadId, detail: "reminder skipped: reminders are off" }; // also stops ones already queued

  const lead = await getLead(c.kommoSubdomain, s.kommoToken, leadId);
  if (String(lead.statusId) !== c.handoffStatusId) return { status: "ignored", leadId, detail: "reminder skipped: lead left Human Handoff" };

  // Human = a real Kommo user. Bot / AI-agent / salesbot messages have no user id, so they don't count.
  const users = await getUsers(c.kommoSubdomain, s.kommoToken);
  const out = await getEventsFor(c.kommoSubdomain, s.kommoToken, {
    types: HUMAN_ACTIONS,
    from: handoffAt,
    leadIds: [Number(leadId)],
    contactIds: lead.contactId ? [lead.contactId] : [],
  });
  const human = out.filter((e) => isHumanReply(e, users, handoffAt));
  if (human.length)
    return { status: "ignored", leadId, detail: `reminder skipped: ${users.get(human[0].created_by) ?? "a WhatsApp reply"} already replied ${diag(human, handoffAt)}` };

  const vars: Parameters<typeof render>[1] = { lead: lead.name, tags: lead.tags.join(", "), contact: undefined, phone: undefined, link: `https://${c.kommoSubdomain}.kommo.com/leads/detail/${leadId}` };
  if (lead.contactId) {
    const ct = await getContact(c.kommoSubdomain, s.kommoToken, lead.contactId).catch(() => null);
    vars.contact = ct?.name;
    vars.phone = ct?.phone;
  }
  const text = `⏰ Sin respuesta desde hace ${c.reminderMinutes} min\n\n${render(c.messageTemplate, vars)}`;
  const r = await Promise.allSettled(c.telegramChatIds.map((id) => sendMessage(s.telegramToken, id, text, true)));
  const failed = r.filter((x) => x.status === "rejected").length;
  return failed
    ? { status: "error", leadId, detail: `reminder: ${failed}/${r.length} sends failed` }
    : { status: "sent", leadId, detail: `reminder after ${c.reminderMinutes} min. Saw ${out.length} outgoing events ${diag(out, handoffAt)}, ${users.size} known users, lead ${lead.contactId ? "has" : "has NO"} contact` };
}

/** The last 24 h, computed from Kommo's own event history (not from what the Hub happened to see). */
async function summary(i: Integration): Promise<RunResult> {
  const c = cfg(i);
  const s = sec(i);
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;
  const ev = (types: string[], entities: string[]) => getEvents(c.kommoSubdomain, s.kommoToken, { types, entities, from });

  const users = await getUsers(c.kommoSubdomain, s.kommoToken);
  const added = await ev(["lead_added"], ["lead"]);
  const moved = await ev(["lead_status_changed"], ["lead"]);
  const tagsAdded = await ev(["entity_tag_added"], ["lead"]);

  const times = handoffTimes(moved, c.handoffStatusId);
  const cap = [...times.keys()].slice(0, 40); // ponytail: 40 handoffs per summary; raise if you exceed it
  const leads = new Map<number, LeadInfo>();
  const contactIds: number[] = [];
  await mapLimit(cap, 4, async (id) => {
    const l = await getLead(c.kommoSubdomain, s.kommoToken, String(id));
    const ct = l.contactId ? await getContact(c.kommoSubdomain, s.kommoToken, l.contactId).catch(() => null) : null;
    leads.set(id, { id, name: ct?.name || l.name || `#${id}`, contactId: l.contactId, statusId: l.statusId });
    if (l.contactId) contactIds.push(l.contactId);
  });

  const chat = (types: string[]) => getEventsFor(c.kommoSubdomain, s.kommoToken, { types, from, leadIds: cap, contactIds });
  const outgoing = await chat(HUMAN_ACTIONS);
  const incoming = await chat(["incoming_chat_message"]);

  const stats = compute({ handoffStatusId: c.handoffStatusId, users, added, moved, tagsAdded, outgoing, incoming, leads });
  const text = format(stats, c.timezone, now);
  const r = await Promise.allSettled(c.telegramChatIds.map((id) => sendMessage(s.telegramToken, id, text, true)));
  const failed = r.filter((x) => x.status === "rejected").length;
  return failed
    ? { status: "error", detail: `summary: ${failed}/${r.length} sends failed` }
    : { status: "sent", detail: `summary sent (${stats.rows.length} handoffs, ${stats.newLeads} new leads)` };
}

export const flow: Flow = {
  type: "kommo-to-telegram",
  hook: "kommo",
  label: "Kommo → Telegram alerts",
  description: "When a lead moves to Human Handoff in Kommo, you get a Telegram message. A summary arrives every night.",
  needs: ["A Telegram bot and your chat ID", "Kommo admin access (to create a private integration and a web hook)"],
  steps: [
    ...TELEGRAM_STEPS,
    "Kommo token: Settings › Integrations › Create integration (private) › Keys and scopes › long-lived token.",
    "Fill in the account name and both tokens, then press Create integration.",
    "Open it, press Detect stages, pick Human Handoff and Save.",
    "Expand “Inbound address”, copy it, and paste it in Kommo: Settings › Integrations › Web hooks, event “Lead status changed”.",
    "Press “Send a test alert”, then move a test lead to Human Handoff to check the real thing.",
  ],
  configSchema,
  secretsSchema,
  defaults: { messageTemplate: DEFAULT_TEMPLATE, telegramChatIds: ["8692793778"], reminderMinutes: "0", summaryHour: "0", timezone: "Europe/Madrid" },
  fields: [
    { key: "kommoSubdomain", kind: "config", label: "Kommo account name", hint: "The part before .kommo.com in your Kommo address, e.g. letjunior." },
    { key: "kommoToken", kind: "secret", label: "Kommo access token", hint: "Kommo > Settings > Integrations > your private integration > Keys and scopes > long-lived token (read-only scopes)." },
    { key: "telegramToken", kind: "secret", label: "Telegram bot token", hint: "From @BotFather in Telegram. Use the NEW token after /revoke." },
    { key: "telegramChatIds", kind: "config", label: "Telegram chat IDs", hint: "Who gets the alert. Comma-separated numbers.", list: true },
    { key: "handoffStatusId", kind: "config", label: "Stage that triggers the alert", hint: "Save your Kommo details first, then press Detect stages and choose Human Handoff.", detect: "kommo-stages" },
    { key: "messageTemplate", kind: "config", label: "Message text", hint: "You can use {{lead}} {{contact}} {{phone}} {{tags}} {{link}}.", multiline: true },
    { key: "reminderMinutes", kind: "config", label: "Reminder if nobody replies (minutes)", hint: "You get a second alert if no person has answered this long after the first one. 0 = off (currently paused while we improve how replies are detected)." },
    { key: "summaryHour", kind: "config", label: "Daily summary hour (0-23)", hint: "0 = midnight, 12 = noon. Leave empty to turn the summary off." },
    { key: "timezone", kind: "config", label: "Time zone", hint: "Used for the summary time and the busiest hours, e.g. Europe/Madrid, Europe/Rome, America/Bogota." },
  ],
  actions: [{ job: "summary", label: "Send summary now" }],

  async handle(i, body) {
    console.log("[kommo raw payload]", body); // ponytail: remove once real key names are confirmed
    const leads = parseLeads(body);
    if (!leads.length) return [{ status: "ignored", detail: "no lead status events in payload" }];
    return Promise.all(leads.map((l) => handleLead(i, l).catch((e): RunResult => ({ status: "error", leadId: l.id, detail: errMsg(e) }))));
  },

  async job(i, p) {
    try {
      return [p.job === "reminder" ? await reminder(i, p) : p.job === "summary" ? await summary(i) : { status: "ignored" as const, detail: `unknown job ${p.job}` }];
    } catch (e) {
      return [{ status: "error", leadId: p.leadId ? String(p.leadId) : undefined, detail: `${p.job}: ${errMsg(e)}` }];
    }
  },

  schedules(i) {
    const c = cfg(i);
    const on = i.enabled && c.summaryHour !== "";
    return [{ name: "summary", cron: on ? `CRON_TZ=${c.timezone} 0 ${c.summaryHour} * * *` : null, body: { job: "summary" } }];
  },

  async test(i, { alert }) {
    const c = cfg(i);
    const s = sec(i);
    try {
      await checkToken(c.kommoSubdomain, s.kommoToken);
    } catch (e) {
      return { ok: false, message: `Kommo: ${errMsg(e)}. Check the account name and token.` };
    }
    try {
      await getMe(s.telegramToken);
      if (alert) {
        const text = "[TEST] " + render(c.messageTemplate, SAMPLE);
        await Promise.all(c.telegramChatIds.map((id) => sendMessage(s.telegramToken, id, text)));
      }
    } catch (e) {
      return { ok: false, message: `${errMsg(e)}. Check the bot token, and that you pressed Start on the bot.` };
    }
    return { ok: true, message: alert ? "Test alert sent. Check Telegram." : "Kommo and Telegram both connect." };
  },
};
