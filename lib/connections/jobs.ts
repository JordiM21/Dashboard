import { Client, Receiver } from "@upstash/qstash";

// QStash = Upstash's scheduler (free tier). It calls /api/jobs/<integrationId> at the right time.
// Needed because Vercel Hobby cron only runs once a day, imprecisely. Env: QSTASH_TOKEN,
// QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY (+ QSTASH_URL if your console shows one).
const client = () => new Client({ token: process.env.QSTASH_TOKEN ?? "" });
export { client as qstash };

const jobUrl = (integrationId: string) => {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) throw new Error("VERCEL_PROJECT_PRODUCTION_URL is not set");
  return `https://${host}/api/jobs/${integrationId}`;
};

/** One-off: call the job endpoint once, `seconds` from now. */
export const delayJob = (integrationId: string, body: object, seconds: number) =>
  client().publishJSON({ url: jobUrl(integrationId), body, delay: seconds });

export type ScheduleSpec = { name: string; cron: string | null; body: object };

/** Idempotent: a fixed scheduleId means saving again overwrites; cron null removes it. */
export async function syncSchedules(integrationId: string, specs: ScheduleSpec[]) {
  const c = client();
  for (const s of specs) {
    const scheduleId = `sched_${integrationId}_${s.name}`;
    if (s.cron) {
      await c.schedules.create({
        scheduleId,
        destination: jobUrl(integrationId),
        cron: s.cron,
        body: JSON.stringify(s.body),
        headers: { "Content-Type": "application/json" },
      });
    } else {
      await c.schedules.delete(scheduleId).catch(() => {}); // already gone is fine
    }
  }
}

/** True only for genuine QStash calls (signature over the body). */
export async function verifyJob(signature: string | null, body: string) {
  if (!signature) return false;
  try {
    return await new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? "",
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
    }).verify({ signature, body });
  } catch {
    return false;
  }
}
