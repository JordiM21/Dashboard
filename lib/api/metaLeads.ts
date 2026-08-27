/**
 * Lead Ads — pulls native Lead Ads form submissions straight from Meta.
 * Separate from lib/api/kommo.ts: a Lead Ads submission lands here the
 * moment someone submits the form on Facebook/Instagram, before it's ever
 * synced into Kommo (or if it never is). Read-only — this app doesn't
 * create or edit lead forms.
 *
 * Needs the `leads_retrieval` permission, which Meta gates behind extra App
 * Review scrutiny — if it's not granted yet, fetchRecentLeads() throws a
 * clear "not permitted" error rather than silently returning nothing, same
 * as the rest of this app's real-or-explicit-error convention.
 */
import { graphGet, resolveMetaAssets } from "./metaCore";
import type { MetaLeadgenLead } from "@/lib/types";

interface LeadFormRaw {
  id: string;
  name: string;
  status: string;
}

interface LeadRaw {
  id: string;
  created_time: string;
  field_data: { name: string; values: string[] }[];
}

export async function fetchLeadForms(): Promise<{ id: string; name: string; status: string }[]> {
  const assets = await resolveMetaAssets();
  const body = await graphGet<{ data?: LeadFormRaw[] }>(
    `/${assets.pageId}/leadgen_forms`,
    { fields: "id,name,status", limit: "100" },
    assets.pageAccessToken
  );
  return (body.data ?? []).map((f) => ({ id: f.id, name: f.name, status: f.status }));
}

/** Most recent leads across every active lead form on the Page. */
export async function fetchRecentLeads(limit = 50): Promise<MetaLeadgenLead[]> {
  const assets = await resolveMetaAssets();
  const forms = await fetchLeadForms();

  const leadsPerForm = await Promise.all(
    forms.map(async (form) => {
      const body = await graphGet<{ data?: LeadRaw[] }>(
        `/${form.id}/leads`,
        { fields: "id,created_time,field_data", limit: String(limit) },
        assets.pageAccessToken
      );
      return (body.data ?? []).map((lead) => ({
        id: lead.id,
        formName: form.name,
        createdAt: lead.created_time,
        fields: lead.field_data.map((f) => ({ name: f.name, value: f.values?.[0] ?? "" })),
      }));
    })
  );

  return leadsPerForm
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
