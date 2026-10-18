import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const key = () => {
  const k = Buffer.from(process.env.HUB_MASTER_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("HUB_MASTER_KEY must be 32 random bytes, base64");
  return k;
};

/** AES-256-GCM, random IV per value. Output: iv.tag.ciphertext (base64 parts). */
export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
