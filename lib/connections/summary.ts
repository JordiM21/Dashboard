import type { KEvent } from "./providers/kommo";

export type LeadInfo = { id: number; name: string; contactId?: number; statusId: number };

export type Row = {
  id: number;
  name: string;
  handoffAt: number;
  repliedAt?: number;
  agent?: string;
  replyMin?: number;
  stillInHandoff: boolean;
  ghosted: boolean; // a human replied and the customer sent nothing after
};

/** When each lead first entered the handoff stage inside the window (unix s). */
export function handoffTimes(moved: KEvent[], handoffStatusId: string) {
  const t = new Map<number, number>();
  for (const e of moved) {
    if (e.entity_type !== "lead" || String(e.value_after?.[0]?.lead_status?.id) !== handoffStatusId) continue;
    t.set(e.entity_id, Math.min(t.get(e.entity_id) ?? Infinity, e.created_at));
  }
  return t;
}

const mine = (e: KEvent, l: LeadInfo) =>
  (e.entity_type === "lead" && e.entity_id === l.id) || (e.entity_type === "contact" && e.entity_id === l.contactId);

/**
 * Who counts as a person. Kommo records no user for replies sent from the phone's WhatsApp app
 * (created_by 0, same as bots), so an unknown sender counts too, unless the message landed right at the
 * handoff (an automatic "connecting you to a person" message). ponytail: a bot that speaks >60 s after
 * the handoff would count as a person; tighten if your AI keeps talking in that stage.
 */
export const AUTO_GRACE_S = 60;
export const isHumanReply = (e: KEvent, users: Map<number, string>, handoffAt: number) =>
  users.has(e.created_by) || (e.type === "outgoing_chat_message" && e.created_at - handoffAt >= AUTO_GRACE_S);

export const median =(xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export type Input = {
  handoffStatusId: string;
  users: Map<number, string>; // humans only
  added: KEvent[];
  moved: KEvent[];
  tagsAdded: KEvent[];
  outgoing: KEvent[]; // outgoing_chat_message + outgoing_call, for the handoff leads
  incoming: KEvent[]; // incoming_chat_message, for the handoff leads
  leads: Map<number, LeadInfo>; // handoff leads
};

export function compute(x: Input) {
  const times = handoffTimes(x.moved, x.handoffStatusId);

  const rows: Row[] = [...times].map(([id, handoffAt]) => {
    const l = x.leads.get(id) ?? { id, name: `#${id}`, statusId: 0 };
    const first = x.outgoing
      .filter((e) => mine(e, l) && e.created_at >= handoffAt && isHumanReply(e, x.users, handoffAt))
      .sort((a, b) => a.created_at - b.created_at)[0];
    const repliedAt = first?.created_at;
    return {
      id,
      name: l.name,
      handoffAt,
      repliedAt,
      agent: first && (x.users.get(first.created_by) ?? "WhatsApp (teléfono)"),
      replyMin: repliedAt && (repliedAt - handoffAt) / 60,
      stillInHandoff: String(l.statusId) === x.handoffStatusId,
      ghosted: !!repliedAt && !x.incoming.some((e) => mine(e, l) && e.created_at > repliedAt),
    };
  }).sort((a, b) => a.handoffAt - b.handoffAt);

  const closed = (status: number) =>
    new Set(x.moved.filter((e) => e.value_after?.[0]?.lead_status?.id === status).map((e) => e.entity_id)).size;

  const tagLeads = new Map<string, Set<number>>();
  for (const e of x.tagsAdded) {
    const name = e.value_after?.[0]?.tag?.name;
    if (name) tagLeads.set(name, (tagLeads.get(name) ?? new Set()).add(e.entity_id));
  }

  return {
    newLeads: new Set(x.added.filter((e) => e.entity_type === "lead").map((e) => e.entity_id)).size,
    rows,
    won: closed(142), // Kommo's fixed system ids for Closed - won / lost
    lost: closed(143),
    tags: [...tagLeads].map(([n, s]) => [n, s.size] as const).sort((a, b) => b[1] - a[1]),
  };
}

const dur = (min: number) => (min < 60 ? `${Math.max(1, Math.round(min))} min` : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`);
const pct = (a: number, b: number) => (b ? ` (${Math.round((100 * a) / b)}%)` : "");
const MAX_LINES = 20;

export function format(s: ReturnType<typeof compute>, tz: string, now: number) {
  const day = new Date(now * 1000).toLocaleDateString("es-ES", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
  const hour = (ts: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ts * 1000));

  const { rows } = s;
  const answered = rows.filter((r) => r.repliedAt);
  const waiting = rows.filter((r) => !r.repliedAt && r.stillInHandoff);
  const movedOn = rows.filter((r) => !r.repliedAt && !r.stillInHandoff);
  const mins = answered.map((r) => r.replyMin!);

  const out = [`📊 Resumen · ${day} (últimas 24 h)`, "", "EMBUDO", `Leads nuevos: ${s.newLeads}`, `Handoffs: ${rows.length}`];
  if (rows.length) {
    out.push(
      `Respondidos por un humano: ${answered.length}${pct(answered.length, rows.length)}`,
      `Sin respuesta: ${waiting.length + movedOn.length} (${waiting.length} esperando ahora · ${movedOn.length} movidos sin responder)`,
      `Ghosted (respondimos y no contestó): ${answered.filter((r) => r.ghosted).length}`,
    );
  }
  out.push(`Ganados: ${s.won} · Perdidos: ${s.lost}`);

  if (mins.length) {
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    const n = (f: (m: number) => boolean) => mins.filter(f).length;
    out.push(
      "", "TIEMPO DE RESPUESTA",
      `Mediana: ${dur(median(mins))} · Media: ${dur(avg)}`,
      `Más rápido: ${dur(Math.min(...mins))} · Más lento: ${dur(Math.max(...mins))}`,
      `≤5 min: ${n((m) => m <= 5)} · ≤15 min: ${n((m) => m > 5 && m <= 15)} · ≤1 h: ${n((m) => m > 15 && m <= 60)} · >1 h: ${n((m) => m > 60)}`,
    );
  }

  if (rows.length) {
    out.push("", "POR LEAD");
    for (const r of rows.slice(0, MAX_LINES))
      out.push(
        r.repliedAt
          ? `• ${r.name} — ${dur(r.replyMin!)} (${r.agent})${r.ghosted ? " · ghosted" : ""}`
          : `• ${r.name} — sin respuesta${r.stillInHandoff ? `, esperando ${dur((now - r.handoffAt) / 60)}` : ", movido de etapa"}`,
      );
    if (rows.length > MAX_LINES) out.push(`…y ${rows.length - MAX_LINES} más`);
  }

  const agents = new Map<string, number[]>();
  for (const r of answered) agents.set(r.agent!, [...(agents.get(r.agent!) ?? []), r.replyMin!]);
  if (agents.size)
    out.push("", "POR AGENTE", ...[...agents].map(([a, m]) => `${a}: ${m.length} respuestas · mediana ${dur(median(m))}`));

  const hours = new Map<string, number>();
  for (const r of rows) hours.set(hour(r.handoffAt), (hours.get(hour(r.handoffAt)) ?? 0) + 1);
  if (hours.size)
    out.push("", "HORAS CON MÁS HANDOFFS", [...hours].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, c]) => `${h}:00 (${c})`).join(" · "));

  if (s.tags.length) out.push("", "TAGS AÑADIDOS (leads)", ...s.tags.slice(0, 10).map(([t, c]) => `${t}: ${c}`));
  return out.join("\n");
}
