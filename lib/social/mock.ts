"use client";

/**
 * Signed-out `npm run dev` only (production requires sign-in): a stand-in for /api/social that keeps posts in
 * localStorage, so the whole calendar can be tried without Firebase, QStash or Meta. It runs the same rules as
 * the server, and due scheduled posts "publish" on the next load, just like the QStash job would.
 */
import { EDITABLE, problems, type PostInput, type SocialPost } from "./rules";

const KEY = "social-demo-posts";
const at = (days: number, hh: number, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const img = (seed: string) => ({ path: `social/demo-${seed}.jpg`, type: "image" as const, url: `https://picsum.photos/seed/${seed}/600/750` });
const FB = "https://www.facebook.com/";
const IG = "https://www.instagram.com/myletjunior/";

function seed(): SocialPost[] {
  const base = { createdAt: at(-7, 9), updatedAt: at(-7, 9), results: {} };
  return [
    { ...base, id: "d1", caption: "🎃 Halloween vocabulary in 30 seconds. Which word did you know?", platforms: ["facebook", "instagram"], kind: "post", media: [img("pumpkin"), img("ghost"), img("witch")], scheduledAt: at(2, 18), status: "scheduled" },
    { ...base, id: "d2", caption: "Speaking club recap: the kids ran the whole class in English 🙌", platforms: ["instagram"], kind: "reel", media: [{ path: "social/demo-reel.mp4", type: "video" }], scheduledAt: at(5, 12, 30), status: "scheduled" },
    { ...base, id: "d3", caption: "", platforms: ["instagram"], kind: "story", media: [img("story")], scheduledAt: at(1, 9), status: "scheduled" },
    { ...base, id: "d4", caption: "Enrolment for the new term is open. Small groups, real conversation.", platforms: ["facebook", "instagram"], kind: "post", media: [img("class")], scheduledAt: at(-3, 10), status: "published", results: { facebook: { id: "1", url: FB }, instagram: { id: "2", url: IG } } },
    { ...base, id: "d5", caption: "3 ways to practise English at home this weekend", platforms: ["facebook", "instagram"], kind: "post", media: [img("home")], scheduledAt: at(-1, 17), status: "failed", results: { facebook: { id: "3", url: FB }, instagram: { error: "The aspect ratio is not supported. (#36003) — demo error, crop to 4:5 and reschedule." } } },
    { ...base, id: "d6", caption: "Idea: student of the month spotlight", platforms: ["facebook", "instagram"], kind: "post", media: [], scheduledAt: null, status: "draft" },
  ];
}

function load(): SocialPost[] {
  let posts: SocialPost[];
  try {
    posts = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? seed();
  } catch {
    posts = seed();
  }
  // What QStash would have done while you were away.
  return posts.map((p) => (p.status === "scheduled" && p.scheduledAt && Date.parse(p.scheduledAt) <= Date.now() ? fakePublish(p) : p));
}

function save(posts: SocialPost[]) {
  try {
    // Object URLs die with the page, so freshly picked media isn't kept across reloads.
    localStorage.setItem(KEY, JSON.stringify(posts.map((p) => ({ ...p, media: p.media.map((m) => (m.url?.startsWith("blob:") ? { ...m, url: undefined } : m)) }))));
  } catch {}
}

const fakePublish = (p: SocialPost): SocialPost => ({
  ...p,
  status: "published",
  scheduledAt: p.scheduledAt ?? new Date().toISOString(),
  results: Object.fromEntries(p.platforms.map((pl) => [pl, p.results[pl]?.id ? p.results[pl] : { id: "demo", url: pl === "facebook" ? FB : IG }])),
  updatedAt: new Date().toISOString(),
});

const WARN = "Demo mode: saved in this browser only. Live, QStash publishes it at that time.";

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 250)); // feel like a network call
  const posts = load();
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as PostInput) : null;
  const [, , , , id, action] = path.split("/"); // "", api, social, posts, :id, :action
  const find = () => {
    const p = posts.find((x) => x.id === id);
    if (!p) throw new Error("Post not found.");
    return p;
  };
  const check = (input: PostInput, publishing = false) => {
    const issues = problems(input, { publishing });
    if (issues.length) throw new Error(issues.join(" "));
  };
  const done = <R,>(next: SocialPost[], r: R) => (save(next), r as unknown as T);

  if (method === "GET") return done(posts, posts);
  if (method === "DELETE") return done(posts.filter((p) => p.id !== id), {});
  if (action === "publish") {
    const p = find();
    check(p, true);
    const out = fakePublish(p);
    return done(posts.map((x) => (x.id === id ? out : x)), { post: out });
  }
  check(body!);
  const status = body!.scheduledAt ? "scheduled" : "draft";
  if (method === "POST") {
    const now = new Date().toISOString();
    const p: SocialPost = { ...body!, id: `demo_${Math.random().toString(36).slice(2, 8)}`, status, results: {}, createdAt: now, updatedAt: now };
    return done([...posts, p], { post: p, warning: status === "scheduled" ? WARN : undefined });
  }
  const old = find();
  if (!EDITABLE.includes(old.status)) throw new Error(`This post is ${old.status} and can't be changed.`);
  const results = Object.fromEntries(Object.entries(old.results).filter(([, r]) => !r?.error));
  const p: SocialPost = { ...old, ...body!, status, results, updatedAt: new Date().toISOString() };
  return done(posts.map((x) => (x.id === id ? p : x)), { post: p, warning: status === "scheduled" ? WARN : undefined });
}

export const resetDemo = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {}
};
