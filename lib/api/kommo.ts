/**
 * Kommo CRM integration — leads pipeline.
 *
 * Uses a private-integration long-lived token (KOMMO_SUBDOMAIN +
 * KOMMO_ACCESS_TOKEN in .env.local) rather than OAuth — see Kommo Settings >
 * Integrations > Private Integration for how to generate one.
 *
 * Two entry points:
 * - fetchKommoLeads() — small, fast, dummy-fallback summary used by the
 *   Overview KPI cards (top 6 most recent leads, coarse status only).
 * - fetchAllKommoLeadsDetailed() — full paginated pull with resolved
 *   pipeline/stage names and tags, used by the dedicated /kommo page. No
 *   dummy fallback: that page has nothing meaningful to show without real
 *   credentials, so it surfaces a clear "not configured" error instead.
 */

export interface KommoLead {
  id: string;
  name: string;
  status: string;
  value: number;
  createdAt: string;
}

interface KommoLeadRaw {
  id: number;
  name: string;
  price: number;
  status_id: number;
  pipeline_id: number;
  created_at: number; // unix seconds
  updated_at: number;
  _embedded?: { tags?: { id: number; name: string }[] };
}

interface KommoPipelineStatusRaw {
  id: number;
  name: string;
  color?: string;
}

interface KommoPipelineRaw {
  id: number;
  name: string;
  _embedded: { statuses: KommoPipelineStatusRaw[] };
}

function kommoConfigured(): boolean {
  return Boolean(process.env.KOMMO_SUBDOMAIN && process.env.KOMMO_ACCESS_TOKEN);
}

function kommoBaseUrl(): string {
  return `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

function kommoHeaders(): HeadersInit {
  return { Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}` };
}

export async function fetchKommoPipelines(): Promise<import("@/lib/types").KommoPipeline[]> {
  const res = await fetch(`${kommoBaseUrl()}/leads/pipelines`, { headers: kommoHeaders() });
  if (!res.ok) throw new Error(`Kommo pipelines request failed with ${res.status}`);
  if (res.status === 204) return [];

  const body = (await res.json()) as { _embedded?: { pipelines?: KommoPipelineRaw[] } };
  return (body._embedded?.pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    statuses: (p._embedded?.statuses ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color })),
  }));
}

async function fetchStatusNamesById(): Promise<Map<number, string>> {
  const pipelines = await fetchKommoPipelines();
  const map = new Map<number, string>();
  for (const p of pipelines) for (const s of p.statuses) map.set(s.id, s.name);
  return map;
}

export async function fetchKommoLeads(): Promise<KommoLead[]> {
  if (!kommoConfigured()) return dummyLeads();

  const [leadsRes, statusNamesById] = await Promise.all([
    fetch(`${kommoBaseUrl()}/leads?limit=6&order[created_at]=desc`, { headers: kommoHeaders() }),
    fetchStatusNamesById(),
  ]);

  if (leadsRes.status === 204) return [];
  if (!leadsRes.ok) throw new Error(`Kommo leads request failed with ${leadsRes.status}`);

  const body = (await leadsRes.json()) as { _embedded?: { leads?: KommoLeadRaw[] } };
  const leads = body._embedded?.leads ?? [];

  return leads.map((lead) => ({
    id: String(lead.id),
    name: lead.name || `Lead #${lead.id}`,
    status: statusNamesById.get(lead.status_id) ?? "Unknown",
    value: lead.price ?? 0,
    createdAt: new Date(lead.created_at * 1000).toISOString(),
  }));
}

/** Full paginated pull (250/page, Kommo's max) with resolved pipeline/stage names and tags — powers /kommo. */
export async function fetchAllKommoLeadsDetailed(): Promise<import("@/lib/types").KommoLeadDetailed[]> {
  if (!kommoConfigured()) {
    throw new Error("Kommo isn't configured — set KOMMO_SUBDOMAIN and KOMMO_ACCESS_TOKEN in .env.local.");
  }

  const pipelines = await fetchKommoPipelines();
  const pipelineNameById = new Map(pipelines.map((p) => [p.id, p.name]));
  const statusNameById = new Map(pipelines.flatMap((p) => p.statuses.map((s): [number, string] => [s.id, s.name])));

  const leads: KommoLeadRaw[] = [];
  let page = 1;
  // Kommo returns 204 (no body) once you page past the last result — that's the loop's exit condition.
  for (;;) {
    const res = await fetch(`${kommoBaseUrl()}/leads?limit=250&page=${page}&with=tags`, { headers: kommoHeaders() });
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`Kommo leads request failed with ${res.status}`);
    const body = (await res.json()) as { _embedded?: { leads?: KommoLeadRaw[] } };
    const batch = body._embedded?.leads ?? [];
    if (batch.length === 0) break;
    leads.push(...batch);
    if (batch.length < 250) break;
    page++;
  }

  return leads.map((lead) => ({
    id: String(lead.id),
    name: lead.name || `Lead #${lead.id}`,
    price: lead.price ?? 0,
    pipelineId: lead.pipeline_id,
    pipelineName: pipelineNameById.get(lead.pipeline_id) ?? "Unknown pipeline",
    statusId: lead.status_id,
    statusName: statusNameById.get(lead.status_id) ?? "Unknown",
    tags: (lead._embedded?.tags ?? []).map((t) => t.name),
    createdAt: new Date(lead.created_at * 1000).toISOString(),
    updatedAt: new Date(lead.updated_at * 1000).toISOString(),
  }));
}

function dummyLeads(): KommoLead[] {
  const statuses = ["New", "Contacted", "Trial Booked", "Won", "Lost"];
  const names = ["Ana Torres", "Marc Bell", "Priya N.", "Diego R.", "Sofia K.", "Leo M."];
  return Array.from({ length: 6 }, (_, i) => ({
    id: `lead-${i + 1}`,
    name: names[i],
    status: statuses[i % statuses.length],
    value: 80 + i * 15,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  }));
}
