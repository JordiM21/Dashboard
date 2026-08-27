import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { hmacSha256Hex, timingSafeHmacEquals } from "./verifySignature";

/**
 * Receives Meta (Facebook/Instagram) Lead Ads webhooks and creates a new
 * `students` document for each lead. Handles three payload shapes:
 *
 * 1. Meta's real webhook change-notification — only contains a
 *    `leadgen_id`, not the lead's actual field data. If META_PAGE_ACCESS_TOKEN
 *    is set, this follows up with a Graph API call to fetch the full lead.
 * 2. A lead object with `field_data` directly (what that Graph API call
 *    returns, or what some relay/testing tools send already-resolved).
 * 3. A flat `{ name, email, phone }` body — the simplest shape for manual
 *    testing with curl/Postman without any real Meta infrastructure.
 *
 * Also implements Meta's required GET verification handshake (Meta calls
 * the webhook URL with hub.challenge during setup) and, if META_APP_SECRET
 * is set, verifies the X-Hub-Signature-256 header before trusting the body.
 */

interface ParsedLead {
  name: string;
  contact: string;
}

interface MetaFieldDatum {
  name: string;
  values?: string[];
}

export const metaLeadReceiver = onRequest(async (req, res) => {
  if (req.method === "GET") {
    handleVerificationHandshake(req, res);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const appSecret = process.env.META_APP_SECRET;
  if (appSecret && !isValidMetaSignature(req, appSecret)) {
    logger.warn("metaLeadReceiver: rejected request with invalid X-Hub-Signature-256");
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  try {
    const lead = await extractLead(req.body);
    if (!lead) {
      res.status(400).json({ error: "Could not parse a lead (name + contact) from this payload." });
      return;
    }

    const ref = getFirestore().collection("students").doc();
    await ref.set({
      name: lead.name,
      contact: lead.contact,
      status: "active",
      source: "meta_lead_ad",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`metaLeadReceiver: created student ${ref.id} from a Meta lead`);
    res.status(200).json({ ok: true, studentId: ref.id });
  } catch (err) {
    logger.error("metaLeadReceiver failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

function handleVerificationHandshake(req: any, res: any) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    res.status(200).send(String(challenge ?? ""));
  } else {
    res.status(403).send("Verification failed");
  }
}

function isValidMetaSignature(req: any, appSecret: string): boolean {
  const signatureHeader = req.headers["x-hub-signature-256"];
  if (!signatureHeader || typeof signatureHeader !== "string") return false;
  const [, providedHex] = signatureHeader.split("sha256=");
  if (!providedHex) return false;

  const rawBody: Buffer | undefined = req.rawBody;
  if (!rawBody) return false;

  const expectedHex = hmacSha256Hex(appSecret, rawBody.toString());
  return timingSafeHmacEquals(expectedHex, providedHex);
}

async function extractLead(body: any): Promise<ParsedLead | null> {
  // Case 1: Meta's real leadgen change-notification — fetch the full lead.
  const change = body?.entry?.[0]?.changes?.[0]?.value;
  if (change?.leadgen_id) {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) {
      logger.warn(
        "metaLeadReceiver: got a leadgen notification but META_PAGE_ACCESS_TOKEN is not set — cannot fetch lead details."
      );
      return null;
    }
    const url = `https://graph.facebook.com/v19.0/${change.leadgen_id}?access_token=${pageAccessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Graph API fetch failed with ${res.status}`);
    const data = (await res.json()) as { field_data?: MetaFieldDatum[] };
    return parseFieldData(data.field_data);
  }

  // Case 2: a lead object with field_data directly.
  if (Array.isArray(body?.field_data)) {
    return parseFieldData(body.field_data);
  }

  // Case 3: flat payload, for manual testing.
  if (body?.name && (body?.email || body?.phone)) {
    return { name: String(body.name), contact: String(body.email || body.phone) };
  }

  return null;
}

function parseFieldData(fieldData: MetaFieldDatum[] | undefined): ParsedLead | null {
  if (!fieldData) return null;
  const get = (key: string) => fieldData.find((f) => f.name === key)?.values?.[0];

  const fullName = get("full_name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ");
  const contact = get("email") || get("phone_number");

  if (!fullName || !contact) return null;
  return { name: fullName, contact };
}
