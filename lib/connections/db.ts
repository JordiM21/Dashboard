import { Redis } from "@upstash/redis";
import { decrypt, encrypt } from "./crypto";
import type { Integration, RunLog, RunResult } from "./types";

let client: Redis | undefined;
const redis = () => (client ??= Redis.fromEnv()); // lazy: builds without env vars

const mapSecrets = (i: Integration, fn: (v: string) => string): Integration => ({
  ...i,
  secrets: Object.fromEntries(Object.entries(i.secrets).map(([k, v]) => [k, fn(v)])),
});

export async function getIntegration(id: string) {
  const raw = await redis().get<Integration>(`int:${id}`);
  return raw ? mapSecrets(raw, decrypt) : null;
}

export async function getBySecret(secret: string) {
  const id = await redis().get<string>(`hook:${secret}`);
  return id ? getIntegration(id) : null;
}

export async function listIntegrations() {
  const ids = await redis().smembers("ints");
  const all = await Promise.all(ids.map(getIntegration));
  return (all.filter(Boolean) as Integration[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveIntegration(i: Integration) {
  const prev = await redis().get<Integration>(`int:${i.id}`);
  const p = redis().pipeline();
  p.set(`int:${i.id}`, mapSecrets(i, encrypt));
  p.sadd("ints", i.id);
  p.set(`hook:${i.webhookSecret}`, i.id);
  if (prev && prev.webhookSecret !== i.webhookSecret) p.del(`hook:${prev.webhookSecret}`);
  await p.exec();
}

export async function deleteIntegration(i: Integration) {
  await redis().pipeline().del(`int:${i.id}`, `hook:${i.webhookSecret}`, `logs:${i.id}`).srem("ints", i.id).exec();
}

export async function addLog(integrationId: string, r: RunResult) {
  const log: RunLog = { id: crypto.randomUUID(), integrationId, at: new Date().toISOString(), ...r };
  await redis().pipeline().lpush(`logs:${integrationId}`, log).ltrim(`logs:${integrationId}`, 0, 499).exec();
}

export const getLogs = (integrationId: string, n = 500) =>
  redis().lrange<RunLog>(`logs:${integrationId}`, 0, n - 1);

/** Newest-first feed across all integrations. */
export async function allLogs(status?: string, limit = 100) {
  const ints = await listIntegrations();
  const logs = (await Promise.all(ints.map((i) => getLogs(i.id)))).flat();
  return logs
    .filter((l) => !status || l.status === status)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** True the first time a key is seen within 10 minutes (Kommo can redeliver events). */
export async function claimDedupe(key: string) {
  return (await redis().set(`dedupe:${key}`, 1, { nx: true, ex: 600 })) === "OK";
}

/** True while `key` has been used `limit` times or fewer in the last `windowS` seconds. */
export async function rateLimited(key: string, limit: number, windowS: number) {
  const n = await redis().incr(`rl:${key}`);
  if (n === 1) await redis().expire(`rl:${key}`, windowS);
  return n > limit;
}

/** 5 attempts per 10 minutes per IP. */
export const allowLogin = async (ip: string) => !(await rateLimited(`login:${ip}`, 5, 600));
