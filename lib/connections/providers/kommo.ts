// Read-only Kommo REST v4 client. Subdomain is validated by the flow's schema (no SSRF via host).
async function get(sub: string, token: string, path: string) {
  const r = await fetch(`https://${sub}.kommo.com/api/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204) return null;
  if (!r.ok) {
    // Kommo explains 4xx in the body; keep it short and never include the token.
    const why = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Kommo API ${r.status} on ${path.split("?")[0]}${why ? `: ${why}` : ""}`);
  }
  return r.json();
}

export async function getLead(sub: string, token: string, id: string) {
  const d = await get(sub, token, `/leads/${id}?with=contacts`);
  return {
    name: (d?.name as string) ?? "",
    tags: ((d?._embedded?.tags ?? []) as { name: string }[]).map((t) => t.name),
    contactId: d?._embedded?.contacts?.[0]?.id as number | undefined,
    statusId: Number(d?.status_id),
  };
}

/** Kommo event (only the fields we read). created_at is unix seconds; created_by 0 = bot/system. */
export type KEvent = {
  type: string;
  entity_id: number;
  entity_type: string;
  created_by: number;
  created_at: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value_after?: any[];
};

/** Events API, paginated. Kommo caps events at 100 per page. ponytail: 50 pages = 5000 events; raise if a busy day gets truncated. */
export async function getEvents(sub: string, token: string, o: { types: string[]; entities: string[]; from: number; ids?: number[] }) {
  const out: KEvent[] = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({ limit: "100", page: String(page), "filter[created_at][from]": String(o.from) });
    o.types.forEach((t) => q.append("filter[type][]", t));
    o.entities.forEach((e) => q.append("filter[entity][]", e)); // Kommo rejects the request without this
    o.ids?.forEach((id) => q.append("filter[entity_id][]", String(id)));
    const d = await get(sub, token, `/events?${q}`);
    const batch = (d?._embedded?.events ?? []) as KEvent[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** Events for specific leads and contacts. Kommo allows one entity type per entity_id filter, so two requests. */
export async function getEventsFor(sub: string, token: string, o: { types: string[]; from: number; leadIds: number[]; contactIds: number[] }) {
  const one = (entity: string, ids: number[]) =>
    ids.length ? getEvents(sub, token, { types: o.types, entities: [entity], from: o.from, ids }) : [];
  const [leads, contacts] = await Promise.all([one("lead", o.leadIds), one("contact", o.contactIds)]);
  return [...leads, ...contacts];
}

/** id -> name of every human user in the account (bots/salesbots are not users). */
export async function getUsers(sub: string, token: string) {
  const d = await get(sub, token, "/users?limit=250");
  return new Map(((d?._embedded?.users ?? []) as { id: number; name: string }[]).map((u) => [u.id, u.name]));
}

export async function getContact(sub: string, token: string, id: number) {
  const d = await get(sub, token, `/contacts/${id}`);
  const phone = (d?.custom_fields_values ?? []).find((f: { field_code?: string }) => f.field_code === "PHONE");
  return { name: (d?.name as string) ?? "", phone: (phone?.values?.[0]?.value as string) ?? "" };
}

export async function getStages(sub: string, token: string) {
  const d = await get(sub, token, "/leads/pipelines");
  type P = { name: string; _embedded: { statuses: { id: number; name: string }[] } };
  return ((d?._embedded?.pipelines ?? []) as P[]).flatMap((p) =>
    p._embedded.statuses.map((s) => ({ id: String(s.id), label: `${p.name} › ${s.name}` })),
  );
}

export const checkToken = (sub: string, token: string) => get(sub, token, "/account");

/* ---------- Writes (website form -> Kommo lead). Same error handling as get(). ---------- */
async function send(method: "POST" | "PATCH", sub: string, token: string, path: string, body: unknown) {
  const r = await fetch(`https://${sub}.kommo.com/api/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const why = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Kommo API ${r.status} on ${method} ${path}${why ? `: ${why}` : ""}`);
  }
  return r.status === 204 ? null : r.json();
}

const CLOSED = [142, 143]; // Kommo's fixed "won" / "lost" statuses

/** Same number written differently ("+507 6123-4567" vs "61234567"): compare the last 8 digits. */
export const samePhone = (a: string, b: string) => {
  const x = a.replace(/\D/g, ""), y = b.replace(/\D/g, "");
  return x.length >= 7 && y.length >= 7 && x.slice(-8) === y.slice(-8);
};

/** Contact whose phone matches, plus its open lead if it has one. */
async function findByPhone(sub: string, token: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  const d = await get(sub, token, `/contacts?query=${encodeURIComponent(digits.slice(-8))}&with=leads&limit=10`);
  type C = { id: number; custom_fields_values?: { field_code?: string; values: { value: string }[] }[]; _embedded?: { leads?: { id: number }[] } };
  const match = ((d?._embedded?.contacts ?? []) as C[]).find((c) =>
    (c.custom_fields_values ?? []).some((f) => f.field_code === "PHONE" && f.values.some((v) => samePhone(v.value, phone))),
  );
  if (!match) return null;
  for (const l of match._embedded?.leads ?? []) {
    const lead = await get(sub, token, `/leads/${l.id}`);
    if (lead && !CLOSED.includes(Number(lead.status_id))) return { contactId: match.id, openLeadId: l.id };
  }
  return { contactId: match.id, openLeadId: undefined };
}

/** Pipeline that owns a status id (Kommo needs both when the stage isn't in the main pipeline). */
async function pipelineOf(sub: string, token: string, statusId: number) {
  const d = await get(sub, token, "/leads/pipelines");
  type P = { id: number; _embedded: { statuses: { id: number }[] } };
  return ((d?._embedded?.pipelines ?? []) as P[]).find((p) => p._embedded.statuses.some((s) => s.id === statusId))?.id;
}

/**
 * Website lead -> Kommo. Reuses the contact (by phone) and its open lead if there is one, so a parent who
 * already wrote on WhatsApp doesn't get a duplicate; otherwise creates a lead in `statusId` (0 = Kommo's default).
 * Either way the lead gets `tag` and a note with every form answer.
 */
export async function upsertWebLead(
  sub: string,
  token: string,
  o: { name: string; phone: string; tag: string; statusId: number; note: string },
) {
  const found = await findByPhone(sub, token, o.phone);
  const contactId =
    found?.contactId ??
    ((await send("POST", sub, token, "/contacts", [
      { name: o.name, custom_fields_values: [{ field_code: "PHONE", values: [{ value: o.phone, enum_code: "MOB" }] }] },
    ]))?._embedded?.contacts?.[0]?.id as number);

  let leadId = found?.openLeadId;
  if (leadId) {
    await send("PATCH", sub, token, "/leads", [{ id: leadId, tags_to_add: [{ name: o.tag }] }]);
  } else {
    const stage = o.statusId ? { status_id: o.statusId, pipeline_id: await pipelineOf(sub, token, o.statusId) } : {};
    const d = await send("POST", sub, token, "/leads", [
      { name: `Web · ${o.name}`, ...stage, _embedded: { tags: [{ name: o.tag }], contacts: [{ id: contactId }] } },
    ]);
    leadId = d?._embedded?.leads?.[0]?.id as number;
  }
  await send("POST", sub, token, `/leads/${leadId}/notes`, [{ note_type: "common", params: { text: o.note } }]);
  return { leadId, reused: Boolean(found?.openLeadId) };
}
