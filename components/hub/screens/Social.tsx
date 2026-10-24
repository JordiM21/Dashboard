"use client";

/**
 * Social: plan Facebook + Instagram posts on a month calendar and let the server publish them on time
 * (QStash → /api/social/publish). Posts live in Firestore hub_social_posts via /api/social; media is
 * uploaded straight to Firebase Storage from the browser (videos are too big for a Vercel request body).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CaretLeft, CaretRight, FacebookLogo, InstagramLogo, Plus, X, ArrowSquareOut, VideoCamera } from "@phosphor-icons/react";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { firebaseApp } from "@/lib/firebase/client";
import { authFetch } from "@/lib/firebase/authFetch";
import { useLive } from "@/lib/hub/live";
import { toast } from "@/lib/hub/fx";
import { addDays, dayOfWeek, formatDateDMY, localIso, monthName, today, uid } from "@/lib/hub/util";
import { mockApi, resetDemo } from "@/lib/social/mock";
import { EDITABLE, problems, type Media, type Platform, type PostInput, type PostKind, type SocialPost } from "@/lib/social/rules";
import { Toolbar } from "../Shell";
import { Empty, Fade, Segmented, Sheet, useDrop } from "../ui";

// Signed-out dev (demo) talks to an in-browser mock instead of /api/social. Set by <Social> on render.
let demo = false;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (demo) return mockApi<T>(path, init);
  const r = await authFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

const TONE: Record<SocialPost["status"], string> = { draft: "var(--text-3)", scheduled: "var(--accent)", publishing: "var(--warning)", published: "var(--success)", failed: "var(--danger)" };
const CHIP: Record<SocialPost["status"], string> = { draft: "", scheduled: "accent", publishing: "warning", published: "success", failed: "danger" };
const ICON = { facebook: FacebookLogo, instagram: InstagramLogo };

/** UTC ISO ↔ the local wall clock the calendar and <input type="datetime-local"> speak. */
const localOf = (iso: string) => localIso(new Date(iso));
const toUtc = (local: string) => new Date(local).toISOString();
const timeOf = (iso: string) => localOf(iso).slice(11, 16);

export default function Social() {
  const live = useLive();
  demo = live.mode === "demo";
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ post?: SocialPost; day?: string } | null>(null);
  const [month, setMonth] = useState(() => today().slice(0, 7));

  const load = useCallback(() => {
    api<SocialPost[]>("/api/social/posts").then((p) => (setPosts(p), setErr("")), (e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000); // scheduled → published shows up on its own
    return () => clearInterval(t);
  }, [live.mode, load]);

  const upsert = (p: SocialPost) => setPosts((all) => [...(all ?? []).filter((x) => x.id !== p.id), p]);

  /** Drag onto a day: keep the post's time of day (drafts land at 10:00). */
  const moveTo = async (id: string, day: string) => {
    const p = posts?.find((x) => x.id === id);
    if (!p || !EDITABLE.includes(p.status)) return;
    const at = toUtc(`${day}T${p.scheduledAt ? timeOf(p.scheduledAt) : "10:00"}`);
    upsert({ ...p, scheduledAt: at, status: "scheduled" });
    try {
      const r = await api<{ post: SocialPost; warning?: string }>(`/api/social/posts/${id}`, { method: "PATCH", body: JSON.stringify(inputOf({ ...p, scheduledAt: at })) });
      upsert(r.post);
      toast(r.warning ?? `Moved to ${formatDateDMY(day)}`, r.warning ? { tone: "danger" } : {});
    } catch (e) {
      upsert(p);
      toast((e as Error).message, { tone: "danger" });
    }
  };

  const first = `${month}-01`;
  const gridStart = addDays(first, -((dayOfWeek(first) + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const drafts = posts?.filter((p) => !p.scheduledAt) ?? [];
  const byDay = (day: string) => (posts ?? []).filter((p) => p.scheduledAt && localOf(p.scheduledAt).startsWith(day)).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));

  return (
    <>
      <Toolbar areas={false} title="Social">
        <button className="btn" onClick={() => setOpen({})}>
          <Plus size={14} /> Post
        </button>
      </Toolbar>
      <Fade className="canvas">
        {err ? (
          <Empty text={`Couldn't load posts: ${err}`} action="Retry" onAction={load} />
        ) : !posts ? (
          <div className="skeleton" style={{ height: 520, borderRadius: "var(--r-card)" }} />
        ) : (
          <>
            {demo && (
              <p className="callout chip warning" style={{ height: "auto", padding: "8px 12px", whiteSpace: "normal", marginBottom: 16, display: "flex", gap: 8 }}>
                <span className="grow">Demo data. Nothing here touches Facebook or Instagram, and posts are kept in this browser only.</span>
                <button className="btn btn-sm" onClick={() => (resetDemo(), load())}>
                  Reset demo
                </button>
              </p>
            )}
            {drafts.length > 0 && (
              <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                <span className="label" style={{ marginRight: 4 }}>Drafts</span>
                {drafts.map((p) => (
                  <PostChip key={p.id} p={p} onOpen={() => setOpen({ post: p })} />
                ))}
                <span className="caption faint">Drag one onto a day to schedule it.</span>
              </div>
            )}
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 className="title">
                {monthName(month)} {month.slice(0, 4)}
              </h2>
              <span className="spacer" />
              <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
                <CaretLeft size={16} />
              </button>
              <button className="btn btn-sm" onClick={() => setMonth(today().slice(0, 7))}>
                Today
              </button>
              <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
                <CaretRight size={16} />
              </button>
            </div>
            <div className="week" style={{ gap: 0, marginBottom: 6 }}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d} className="label" style={{ padding: "0 8px" }}>
                  {d}
                </span>
              ))}
            </div>
            <div className="month">
              {cells.map((d) => (
                <Day key={d} date={d} out={!d.startsWith(month)} posts={byDay(d)} onDrop={(id) => moveTo(id, d)} onOpen={(post) => setOpen({ post })} onNew={() => setOpen({ day: d })} />
              ))}
            </div>
          </>
        )}
      </Fade>
      <Composer
        key={open?.post?.id ?? open?.day ?? "new"}
        open={!!open}
        post={open?.post}
        day={open?.day}
        onClose={() => setOpen(null)}
        onSaved={(p) => (upsert(p), setOpen(null))}
        onDeleted={(id) => (setPosts((all) => all?.filter((x) => x.id !== id) ?? null), setOpen(null))}
      />
    </>
  );
}

function PostChip({ p, onOpen }: { p: SocialPost; onOpen: () => void }) {
  return (
    <button
      draggable={EDITABLE.includes(p.status)}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
      className="month-ev row"
      style={{ "--c": TONE[p.status], gap: 4, maxWidth: "100%" } as CSSProperties}
      onClick={(e) => (e.stopPropagation(), onOpen())}
      title={`${p.status} · ${p.caption || "(no caption)"}`}
    >
      {p.platforms.map((pl) => {
        const I = ICON[pl];
        return <I key={pl} size={11} weight="fill" style={{ flex: "none" }} />;
      })}
      {p.scheduledAt && <span style={{ flex: "none", fontWeight: 600 }}>{timeOf(p.scheduledAt)}</span>}
      <span className="truncate">{p.caption || (p.kind === "post" ? "Post" : p.kind[0].toUpperCase() + p.kind.slice(1))}</span>
    </button>
  );
}

function Day({ date, out, posts, onDrop, onOpen, onNew }: { date: string; out: boolean; posts: SocialPost[]; onDrop: (id: string) => void; onOpen: (p: SocialPost) => void; onNew: () => void }) {
  const { over, props } = useDrop(onDrop);
  const future = date >= today();
  return (
    <div className="month-cell" data-out={out} data-today={date === today()} data-over={over} {...props} onClick={(e) => future && e.target === e.currentTarget && onNew()} style={{ cursor: future ? "pointer" : undefined }}>
      <span className="month-num">{Number(date.slice(8))}</span>
      {posts.slice(0, 4).map((p) => (
        <PostChip key={p.id} p={p} onOpen={() => onOpen(p)} />
      ))}
      {posts.length > 4 && <span className="caption faint">+{posts.length - 4} more</span>}
    </div>
  );
}

const inputOf = (p: PostInput): PostInput => ({ caption: p.caption, platforms: p.platforms, kind: p.kind, media: p.media.map(({ path, type }) => ({ path, type })), scheduledAt: p.scheduledAt });

/** Instagram only accepts JPEG photos, so every photo is re-encoded in the browser before upload. */
async function toJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg") return file;
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  [c.width, c.height] = [bmp.width, bmp.height];
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't convert the image."))), "image/jpeg", 0.92));
}

async function upload(file: File): Promise<Media> {
  const video = file.type.startsWith("video/");
  if (demo) return { path: `social/demo-${uid()}`, type: video ? "video" : "image", url: URL.createObjectURL(file) };
  const blob = video ? file : await toJpeg(file);
  const ext = video ? (file.name.match(/\.(\w+)$/)?.[1] ?? "mp4").toLowerCase() : "jpg";
  const path = `social/${uid()}.${ext}`;
  await uploadBytes(ref(getStorage(firebaseApp), path), blob, { contentType: video ? file.type : "image/jpeg" });
  return { path, type: video ? "video" : "image", url: URL.createObjectURL(blob) };
}

function Composer({ open, post, day, onClose, onSaved, onDeleted }: { open: boolean; post?: SocialPost; day?: string; onClose: () => void; onSaved: (p: SocialPost) => void; onDeleted: (id: string) => void }) {
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(post?.platforms ?? ["facebook", "instagram"]);
  const [kind, setKind] = useState<PostKind>(post?.kind ?? "post");
  const [media, setMedia] = useState<Media[]>(post?.media ?? []);
  const [when, setWhen] = useState(post?.scheduledAt ? localOf(post.scheduledAt).slice(0, 16) : day ? `${day}T10:00` : "");
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = !post || EDITABLE.includes(post.status);

  const input = (scheduled: boolean): PostInput => ({ caption, platforms: kind === "story" ? ["instagram"] : platforms, kind, media, scheduledAt: scheduled && when ? toUtc(when) : null });
  const issues = problems({ ...input(false) }); // what blocks publishing at all
  const schedIssues = when ? problems(input(true)) : issues; // + the time must be in the future

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, { tone: "danger" });
    }
    setBusy("");
  };

  const save = (scheduled: boolean) =>
    run(scheduled ? "schedule" : "draft", async () => {
      const r = await api<{ post: SocialPost; warning?: string }>(post ? `/api/social/posts/${post.id}` : "/api/social/posts", { method: post ? "PATCH" : "POST", body: JSON.stringify(inputOf(input(scheduled))) });
      toast(r.warning ?? (scheduled ? `Scheduled for ${formatDateDMY(when.slice(0, 10))} ${when.slice(11)}` : "Draft saved"), r.warning ? { tone: "danger" } : {});
      onSaved(r.post);
    });

  const publishNow = () =>
    run("publish", async () => {
      // Save first so what goes out is what's on screen.
      const saved = (await api<{ post: SocialPost }>(post ? `/api/social/posts/${post.id}` : "/api/social/posts", { method: post ? "PATCH" : "POST", body: JSON.stringify(inputOf(input(false))) })).post;
      const r = await api<{ post: SocialPost }>(`/api/social/posts/${saved.id}/publish`, { method: "POST" });
      const tone = r.post.status === "failed" ? "danger" : undefined;
      toast(r.post.status === "published" ? "Published" : r.post.status === "publishing" ? "Instagram is processing the video. It'll go out in a few minutes." : "Some platforms failed. Open the post to see why.", { tone });
      onSaved(r.post);
    });

  const remove = () =>
    post &&
    confirm(post.status === "published" ? "Remove it from the calendar? It stays on Facebook and Instagram." : "Delete this post?") &&
    run("delete", async () => {
      await api(`/api/social/posts/${post.id}`, { method: "DELETE" });
      onDeleted(post.id);
    });

  const pick = (files: FileList | null) =>
    files?.length &&
    run("upload", async () => {
      const added = await Promise.all([...files].map(upload));
      setMedia((m) => [...m, ...added].slice(0, 10));
    });

  const togglePlatform = (p: Platform) => setPlatforms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  return (
    <Sheet open={open} onClose={onClose} wide label={post ? "Edit post" : "New post"}>
      <div className="row">
        <h2 className="title grow">{post ? "Post" : "New post"}</h2>
        {post && <span className={`chip ${CHIP[post.status]}`}>{post.status}</span>}
      </div>

      {post && Object.keys(post.results).length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          {(Object.entries(post.results) as [Platform, SocialPost["results"][Platform]][]).map(([pl, r]) => {
            const I = ICON[pl];
            return (
              <div key={pl} className="row callout" style={{ gap: 8, alignItems: "flex-start" }}>
                <I size={16} weight="fill" style={{ flex: "none", marginTop: 2 }} />
                {r?.error ? (
                  <span style={{ color: "var(--danger-ink)" }}>{r.error}</span>
                ) : r?.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>
                    Published <ArrowSquareOut size={13} />
                  </a>
                ) : (
                  <span>Published</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <fieldset disabled={!editable || !!busy} className="col" style={{ gap: 14, border: 0, padding: 0, margin: 0 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {(["facebook", "instagram"] as const).map((p) => {
            const I = ICON[p];
            const on = kind === "story" ? p === "instagram" : platforms.includes(p);
            return (
              <button key={p} type="button" className="btn" aria-pressed={on} disabled={kind === "story"} onClick={() => togglePlatform(p)} style={on ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : { opacity: 0.6 }}>
                <I size={14} weight={on ? "fill" : "regular"} /> {p === "facebook" ? "Facebook" : "Instagram"}
              </button>
            );
          })}
          <span className="spacer" />
          <Segmented label="Format" size="sm" value={kind} onChange={setKind} options={[{ value: "post", label: "Post" }, { value: "reel", label: "Reel" }, { value: "story", label: "Story" }]} />
        </div>

        {kind !== "story" && (
          <label className="field">
            <span>Caption</span>
            <textarea className="textarea" rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What's this post about?" />
            <span className="caption faint" style={{ alignSelf: "flex-end", color: caption.length > 2200 ? "var(--danger-ink)" : undefined }}>
              {caption.length.toLocaleString()} / 2,200
            </span>
          </label>
        )}

        <div className="field">
          <span>Media</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {media.map((m, i) => (
              <div key={m.path} style={{ position: "relative", width: 96, height: 96, borderRadius: "var(--r-tile)", overflow: "hidden", background: "var(--bg-sunken)" }}>
                {m.type === "video" ? (
                  m.url ? <video src={m.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <VideoCamera size={28} style={{ margin: 34 }} />
                ) : (
                  <img src={m.url} alt={`Media ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                {editable && (
                  <button type="button" className="icon-btn" aria-label={`Remove media ${i + 1}`} onClick={() => setMedia(media.filter((x) => x !== m))} style={{ position: "absolute", top: 4, right: 4, background: "var(--bg-surface)" }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {editable && media.length < 10 && (
              <button type="button" className="tile callout muted" style={{ width: 96, height: 96, borderStyle: "dashed", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
                {busy === "upload" ? "Uploading…" : <><Plus size={16} /> Add</>}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
          <span className="caption muted">Photos are converted to JPEG. Instagram wants 4:5 to 1.91:1 for posts, 9:16 for reels and stories.</span>
        </div>

        <label className="field" style={{ maxWidth: 260 }}>
          <span>When</span>
          <input className="input" type="datetime-local" value={when} min={localIso().slice(0, 16)} onChange={(e) => setWhen(e.target.value)} />
        </label>
      </fieldset>

      {editable && schedIssues.length > 0 && <p className="callout" style={{ color: "var(--warning-ink)", margin: 0 }}>{schedIssues[0]}</p>}

      {editable && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={!!busy || !when || schedIssues.length > 0} onClick={() => save(true)}>
            {busy === "schedule" ? "Scheduling…" : "Schedule"}
          </button>
          <button className="btn" disabled={!!busy || issues.length > 0} onClick={publishNow}>
            {busy === "publish" ? "Publishing…" : "Publish now"}
          </button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => save(false)}>
            Save draft
          </button>
          <span className="spacer" />
          {post && (
            <button className="btn btn-ghost btn-danger" disabled={!!busy} onClick={remove}>
              Delete
            </button>
          )}
        </div>
      )}
      {!editable && post && (
        <div className="row">
          <span className="caption muted">{post.status === "publishing" ? "Publishing now. This updates in a few minutes." : `Published${post.scheduledAt ? ` · ${formatDateDMY(localOf(post.scheduledAt).slice(0, 10))} ${timeOf(post.scheduledAt)}` : ""}.`}</span>
          <span className="spacer" />
          {post.status === "published" && (
            <button className="btn btn-ghost btn-danger" disabled={!!busy} onClick={remove}>
              Remove from calendar
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
