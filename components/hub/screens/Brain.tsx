"use client";

/**
 * Brain: the dashboard's window onto the Markdown folder Claude reads. scripts/exportBrain.ts writes
 * the folder on Jordi's PC and copies it to Firestore (`hub_brain_files`, `hub_brain/status`), since
 * this page runs on Vercel and can't see the PC. Read-only: records are edited on their own screens.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, FileText, Folder, Image as ImageIcon } from "@phosphor-icons/react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/AuthContext";
import { ago } from "@/lib/connections/ago";
import { formatDateDMY } from "@/lib/hub/util";
import { Toolbar } from "../Shell";
import { Empty, Fade, Segmented } from "../ui";

type BrainFile = { path: string; content: string | null; bytes: number; modified: string };
type BrainTask = { id: string; name: string; when: string; folder: string; hours: number; prompt: string; lastRun: string | null; lastFile: string | null };
type Status = { exportedAt: string; ms: number; dir: string; files: number; bytes: number; tasks: BrainTask[] };

const when = (iso: string) => `${formatDateDMY(iso)} ${new Date(iso).toTimeString().slice(0, 5)}`;
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

/** Splits the export's `---` front-matter (one JSON value per line) from the body. */
function parse(content: string): { meta: Record<string, unknown>; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: content };
  const meta = Object.fromEntries(
    m[1].split("\n").map((l) => {
      const i = l.indexOf(": ");
      try {
        return [l.slice(0, i), JSON.parse(l.slice(i + 2))];
      } catch {
        return [l.slice(0, i), l.slice(i + 2)];
      }
    })
  );
  return { meta, body: content.slice(m[0].length) };
}

/** Resolves a link inside a file (e.g. `../students/x.md`) to a Brain path. */
function resolve(from: string, href: string): string {
  const out = from.split("/").slice(0, -1);
  for (const seg of href.split("/")) seg === ".." ? out.pop() : seg !== "." && out.push(seg);
  return out.join("/");
}

const KINDS: Record<string, string> = { activity: "Activity", daily: "Daily close", briefs: "Morning brief", weekly: "Weekly review", monthly: "Monthly report" };

export default function Brain() {
  const [files, setFiles] = useState<BrainFile[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState("NOW.md");
  const [open, setOpen] = useState(false); // mobile: viewer replaces the list
  const [tab, setTab] = useState<"register" | "folders">("register");
  const [q, setQ] = useState("");

  const { user, loading } = useAuth();

  useEffect(() => {
    if (!user) return;
    const fail = (e: Error) => setErr(e.message);
    const a = onSnapshot(collection(db, "hub_brain_files"), (s) => setFiles(s.docs.map((d) => d.data() as BrainFile)), fail);
    const b = onSnapshot(doc(db, "hub_brain", "status"), (s) => setStatus((s.data() as Status) ?? null), fail);
    return () => (a(), b());
  }, [user]);

  const byPath = useMemo(() => new Map((files ?? []).map((f) => [f.path, f])), [files]);
  const pick = (p: string) => (setSel(p), setOpen(true));

  if (!loading && !user && !files) return <Shell><Empty text="Sign in to see your Brain." /></Shell>;
  if (err) return <Shell><Empty text={`Couldn't load the Brain: ${err}`} /></Shell>;
  if (!files || !status)
    return (
      <Shell>
        {files && !status ? <Empty text="Nothing synced yet. Run npm run brain in the dashboard folder on your PC." /> : <div className="skeleton" style={{ height: 320 }} />}
      </Shell>
    );

  const sections = ["areas", "business", "journal"].map((s) => ({ s, n: files.filter((f) => f.path.startsWith(`${s}/`)).length }));

  return (
    <Shell>
      <div className="bento">
        <section className="card span-12">
          <div className="card-head">
            <span className="headline">Sync</span>
            <span className="spacer" />
            <span className="caption muted mono">{status.dir}</span>
          </div>
          <div className="grid-cards" style={{ paddingTop: 0, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <Stat label="Last synced" value={ago(status.exportedAt)} sub={`${when(status.exportedAt)} · took ${(status.ms / 1000).toFixed(1)} s`} />
            <Stat label="Files" value={String(status.files)} sub={sections.map((x) => `${x.n} ${x.s}`).join(" · ")} />
            <Stat label="Size" value={kb(status.bytes)} sub="Markdown, read by Claude" />
            <Stat label="Kept fresh by" value="brain:watch" sub="Runs on your PC, re-syncs ~3 s after any change" />
          </div>
        </section>

        <section className="card span-12">
          <div className="card-head">
            <span className="headline">Scheduled tasks</span>
            <span className="caption muted">Claude writes these into journal/ on your PC</span>
          </div>
          <div className="grid-cards" style={{ paddingTop: 0, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {status.tasks.map((t) => {
              const late = t.lastRun && Date.now() - Date.parse(t.lastRun) > t.hours * 3600e3;
              return (
                <div key={t.id} className="tile col" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <span className="headline grow">{t.name}</span>
                    <span className={`chip ${!t.lastRun ? "" : late ? "warning" : "success"}`}>{!t.lastRun ? "Not run yet" : late ? "Late" : "On time"}</span>
                  </div>
                  <span className="caption muted">{t.when}</span>
                  <span className="caption">{t.lastRun ? `Last run ${ago(t.lastRun).toLowerCase()} · ${when(t.lastRun)}` : `Output goes to ${t.folder}/`}</span>
                  {t.lastFile && (
                    <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => pick(t.lastFile!)}>
                      Open latest
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card span-12 brain-split" data-open={open}>
          <div className="brain-nav col" style={{ gap: 10 }}>
            <div className="brain-head col" style={{ gap: 8 }}>
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every file…" aria-label="Search the Brain" />
              {q.trim().length < 2 && <Segmented label="Browse" size="sm" value={tab} onChange={setTab} options={[{ value: "register", label: "Register" }, { value: "folders", label: "Folders" }]} />}
            </div>
            {q.trim().length >= 2 ? <Search files={files} q={q.trim()} sel={sel} pick={pick} /> : tab === "register" ? <Register files={files} sel={sel} pick={pick} /> : <Tree files={files} sel={sel} pick={pick} />}
          </div>
          <div className="brain-view">
            <button className="btn btn-ghost brain-back" onClick={() => setOpen(false)}>
              <ArrowLeft size={14} /> Back
            </button>
            <Viewer file={byPath.get(sel)} path={sel} go={(p) => byPath.has(p) && pick(p)} />
          </div>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Toolbar areas={false} title="Brain" />
      <Fade className="canvas">{children}</Fade>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="tile col" style={{ gap: 2 }}>
      <span className="label">{label}</span>
      <span className="display-m">{value}</span>
      <span className="caption muted">{sub}</span>
    </div>
  );
}

/** journal/ grouped by day, newest first: what happened (activity) next to what Claude made of it. */
function Register({ files, sel, pick }: { files: BrainFile[]; sel: string; pick: (p: string) => void }) {
  const days = useMemo(() => {
    const m = new Map<string, BrainFile[]>();
    for (const f of files.filter((x) => x.path.startsWith("journal/"))) {
      const name = f.path.split("/").pop()!;
      const date = /^\d{4}-\d{2}-\d{2}/.test(name) ? name.slice(0, 10) : f.modified.slice(0, 10);
      (m.get(date) ?? m.set(date, []).get(date)!).push(f);
    }
    return [...m].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [files]);
  if (!days.length) return <Empty text="No journal entries yet." />;
  return (
    <div className="col" style={{ gap: 12 }}>
      {days.map(([date, fs]) => (
        <div key={date} className="col" style={{ gap: 4 }}>
          <span className="label">
            {new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" })} {formatDateDMY(date)}
          </span>
          {fs.map((f) => {
            const kind = f.path.split("/")[1];
            const events = kind === "activity" && f.content ? parse(f.content).meta.events : null;
            return (
              <button key={f.path} className="brain-row" aria-current={sel === f.path} onClick={() => pick(f.path)}>
                <FileText size={14} />
                <span className="grow">{KINDS[kind] ?? kind}</span>
                {events != null && <span className="caption muted">{String(events)} {events === 1 ? "change" : "changes"}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Full-text search over every file's path and content, most matches first, with the first hit in context. */
function Search({ files, q, sel, pick }: { files: BrainFile[]; q: string; sel: string; pick: (p: string) => void }) {
  const hits = useMemo(() => {
    const needle = q.toLowerCase();
    return files
      .map((f) => {
        // Plain text for matching and previews: drop link targets and Markdown/table symbols.
        const text = f.content ? parse(f.content).body.replace(/\]\([^)]*\)/g, "]").replace(/[#*_`>|[\]]|-{3,}/g, " ").replace(/\s+/g, " ") : "";
        const lower = text.toLowerCase();
        const count = lower.split(needle).length - 1 + (f.path.toLowerCase().includes(needle) ? 1 : 0);
        const at = lower.indexOf(needle);
        const from = Math.max(0, at - 50);
        const snippet = at < 0 ? null : { pre: (from ? "…" : "") + text.slice(from, at), hit: text.slice(at, at + q.length), post: text.slice(at + q.length, at + q.length + 70) + "…" };
        return { f, count, snippet };
      })
      .filter((h) => h.count)
      .sort((a, b) => b.count - a.count);
  }, [files, q]);
  if (!hits.length) return <Empty text={`Nothing mentions “${q}”.`} />;
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="caption muted">
        {hits.length} {hits.length === 1 ? "file" : "files"}
      </span>
      {hits.slice(0, 60).map(({ f, count, snippet }) => (
        <button key={f.path} className="brain-row col" style={{ alignItems: "stretch", gap: 2 }} aria-current={sel === f.path} onClick={() => pick(f.path)}>
          <span className="row" style={{ gap: 6 }}>
            <FileText size={14} />
            <span className="grow mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
            <span className="caption muted">{count}</span>
          </span>
          {snippet && (
            <span className="caption muted" style={{ fontWeight: 400 }}>
              {snippet.pre.replace(/\s+/g, " ")}
              <mark>{snippet.hit}</mark>
              {snippet.post.replace(/\s+/g, " ")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

type Node = { name: string; path: string; kids: Map<string, Node>; file?: BrainFile };

/** The folder as Claude sees it. Native <details> handles open/close. */
function Tree({ files, sel, pick }: { files: BrainFile[]; sel: string; pick: (p: string) => void }) {
  const root = useMemo(() => {
    const r: Node = { name: "", path: "", kids: new Map() };
    for (const f of files) {
      let n = r;
      f.path.split("/").forEach((seg, i, all) => {
        const p = all.slice(0, i + 1).join("/");
        if (!n.kids.has(seg)) n.kids.set(seg, { name: seg, path: p, kids: new Map() });
        n = n.kids.get(seg)!;
      });
      n.file = f;
    }
    return r;
  }, [files]);
  const render = (n: Node, depth: number): ReactNode => {
    const kids = [...n.kids.values()].sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
    return kids.map((k) =>
      k.file ? (
        <button key={k.path} className="brain-row" aria-current={sel === k.path} onClick={() => pick(k.path)}>
          {/\.md$/i.test(k.name) ? <FileText size={14} /> : <ImageIcon size={14} />}
          <span className="grow">{k.name.replace(/\.md$/i, "")}</span>
        </button>
      ) : (
        <details key={k.path} open={depth === 0 && sel.startsWith(`${k.path}/`)} className="brain-dir">
          <summary className="brain-row">
            <Folder size={14} />
            <span className="grow">{k.name}</span>
            <span className="caption muted">{[...files].filter((f) => f.path.startsWith(`${k.path}/`)).length}</span>
          </summary>
          <div style={{ paddingLeft: 14 }}>{render(k, depth + 1)}</div>
        </details>
      )
    );
  };
  return <div className="col" style={{ gap: 0 }}>{render(root, 0)}</div>;
}

function Viewer({ file, path, go }: { file?: BrainFile; path: string; go: (p: string) => void }) {
  if (!file) return <Empty text={`${path} isn't in the Brain.`} />;
  const { meta, body } = file.content ? parse(file.content) : { meta: {}, body: "" };
  const chips = Object.entries(meta).filter(([k, v]) => k !== "id" && k !== "generated" && (typeof v !== "string" || v.length < 40));
  return (
    <article className="col" style={{ gap: 12, minWidth: 0 }}>
      <div className="col" style={{ gap: 6 }}>
        <span className="caption muted mono">{path}</span>
        <span className="caption muted">
          Written {ago(file.modified).toLowerCase()} · {when(file.modified)} · {kb(file.bytes)}
        </span>
        {!!chips.length && (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {chips.map(([k, v]) => (
              <span key={k} className="chip">
                {k}: {Array.isArray(v) ? v.join(", ") : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatDateDMY(v.slice(0, 10)) : String(v)}
              </span>
            ))}
          </div>
        )}
      </div>
      {file.content == null ? (
        <Empty text="This file stays on your PC (only Markdown is copied to the dashboard)." />
      ) : (
        <div className="prose">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href = "", children }) =>
                /^[a-z]+:/i.test(href) ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ) : (
                  <a href="#" onClick={(e) => (e.preventDefault(), go(resolve(path, href)))}>
                    {children}
                  </a>
                ),
            }}
          >
            {body}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
}
