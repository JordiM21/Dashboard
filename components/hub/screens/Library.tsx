"use client";

/**
 * Library: one place for everything you keep — notes (one folder per Area),
 * collections (lists with your own fields) and files of any type in folders
 * you make. Drop files anywhere to upload; drag notes, files and folders onto
 * a folder to move them.
 */
import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { MagnifyingGlass, Plus, PushPin, ArrowSquareOut, FileText, Image as ImageIcon, Folder, ArrowLeft, NotePencil, DotsThree, UploadSimple, FolderPlus, SquaresFour, FileVideo, FilePdf } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { toast } from "@/lib/hub/fx";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY } from "@/lib/hub/util";
import type { NoteType } from "@/lib/hub/types";
import type { ResourceFile } from "@/lib/types";
import { Toolbar, useArea, useShell } from "../Shell";
import { Empty, Fade, Segmented, AreaDot, IconByName, useDropdown } from "../ui";
import { coverCss } from "../Customize";
import { CollectionView, NewCollection } from "./Collections";

/** What's open: the root (null), an Area's notes, a file folder, or a collection. */
type Open = null | `area:${string}` | `res:${string}` | `col:${string}`;

async function api(path: string, init: RequestInit): Promise<boolean> {
  const r = await authFetch(path, init).catch(() => null);
  if (!r?.ok) toast(r?.status === 401 ? "Sign in to change files" : "That didn’t save. Try again.");
  return !!r?.ok;
}
const json = (method: string, body: object): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ponytail: uploads go through the API route, so one request tops out at Vercel's ~4.5 MB body limit; upload straight to Storage if bigger files matter.
async function upload(files: FileList | File[], folderId: string | null): Promise<void> {
  const list = [...files];
  if (!list.length) return;
  const n = `${list.length} file${list.length === 1 ? "" : "s"}`;
  toast(`Uploading ${n}…`);
  const fd = new FormData();
  list.forEach((f) => fd.append("files", f));
  fd.append("folderId", folderId ?? "null");
  if (await api("/api/resources/files", { method: "POST", body: fd })) toast(`Uploaded ${n}`);
}

const fileIcon = (f: ResourceFile) => (f.mimeType.startsWith("image") ? <ImageIcon size={16} /> : f.mimeType.startsWith("video") ? <FileVideo size={16} /> : f.mimeType === "application/pdf" ? <FilePdf size={16} /> : <FileText size={16} />);

type Card = { key: string; name: string; kind: string; count: number; color?: string; icon: ReactNode; cover?: string; folderId?: string };

export default function Library() {
  const s = useHub();
  const live = useLive();
  const { match, area } = useArea();
  const { inspect } = useShell();
  const drop = useDropdown();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Open>(null);
  const [type, setType] = useState<NoteType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [over, setOver] = useState<string | null>(null);

  const notes = useMemo(() => s.notes.filter((n) => !n.archivedAt && match(n.areaId)), [s.notes, match]);
  const cols = s.collections.filter((c) => !c.archivedAt && match(c.areaId));
  const resId = open?.startsWith("res:") ? open.slice(4) : null;
  const col = open?.startsWith("col:") ? s.collections.find((c) => c.id === open.slice(4)) : undefined;

  const newNote = () => inspect({ kind: "note", id: A.addNote({ title: "Untitled", areaId: open?.startsWith("area:") ? open.slice(5) : area === "all" ? "let" : area }).id });
  const newFolder = async () => {
    const name = prompt("Folder name")?.trim();
    if (name) await api("/api/resources/folders", json("POST", { name, parentId: resId }));
  };
  const pick = () => {
    const i = document.createElement("input");
    i.type = "file";
    i.multiple = true;
    i.onchange = () => i.files && upload(i.files, resId);
    i.click();
  };
  const addMenu = (e: React.MouseEvent) =>
    drop(e, [
      { label: "Note", icon: <NotePencil size={16} />, onClick: newNote },
      { label: "Upload files", icon: <UploadSimple size={16} />, onClick: pick },
      { label: "Folder", icon: <FolderPlus size={16} />, onClick: newFolder },
      { label: "Collection", icon: <SquaresFour size={16} />, onClick: () => setCreating(true) },
    ]);

  const moveFile = (id: string, folderId: string | null) => api(`/api/resources/files/${id}`, json("PATCH", { folderId }));
  /** Drop targets: an Area folder takes notes; a file folder ("res:root" = top level) takes files and folders. Files from your computer upload wherever they land. */
  const target = (key: string) => ({
    onDragOver: (e: DragEvent) => (e.preventDefault(), e.stopPropagation(), setOver(key)),
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      const into = key === "res:root" ? null : key.slice(4);
      if (e.dataTransfer.files.length) return void upload(e.dataTransfer.files, key.startsWith("res:") ? into : resId);
      const id = e.dataTransfer.getData("text/plain");
      if (id.startsWith("note:") && key.startsWith("area:")) A.updateNote(id.slice(5), { areaId: key.slice(5) });
      if (id.startsWith("file:") && key.startsWith("res:")) moveFile(id.slice(5), into);
      if (id.startsWith("folder:") && key.startsWith("res:") && id.slice(7) !== into) api(`/api/resources/folders/${id.slice(7)}`, json("PATCH", { parentId: into }));
    },
  });

  const n = q.toLowerCase();
  const hits = q
    ? {
        notes: notes.filter((x) => (x.title + " " + x.body).toLowerCase().includes(n)),
        files: live.files.filter((f) => (f.title + " " + f.description + " " + f.tags.join(" ")).toLowerCase().includes(n)),
        items: s.items.filter((i) => !i.archivedAt && cols.some((c) => c.id === i.collectionId) && i.title.toLowerCase().includes(n)),
      }
    : null;

  const NoteRow = ({ id }: { id: string }) => {
    const x = s.notes.find((y) => y.id === id)!;
    const a = s.areas.find((y) => y.id === x.areaId);
    const project = s.projects.find((p) => p.id === x.projectId);
    return (
      <button className="task-row" style={{ width: "100%" }} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", "note:" + x.id)} onClick={() => inspect({ kind: "note", id: x.id })}>
        {x.pinned ? <PushPin size={16} weight="fill" style={{ color: "var(--accent)" }} /> : <span style={{ color: x.icon ? a?.color : "var(--text-3)", display: "inline-flex" }}><IconByName name={x.icon ?? "Note"} size={16} weight={x.icon ? "duotone" : "regular"} /></span>}
        <span className="grow col" style={{ gap: 0, minWidth: 0, textAlign: "left" }}>
          <span className="truncate" style={{ fontWeight: 500 }}>
            {x.title}
          </span>
          <span className="caption muted truncate">{x.body.replace(/[#>*_\n-]+/g, " ").slice(0, 120) || "Empty"}</span>
        </span>
        {x.link && (
          <a className="icon-btn" href={x.link} target={x.link.startsWith("obsidian:") ? undefined : "_blank"} rel="noreferrer" onClick={(e) => e.stopPropagation()} title={x.link.startsWith("obsidian:") ? "Open in Obsidian" : "Open link"}>
            <ArrowSquareOut size={16} />
          </a>
        )}
        {project && <span className="caption muted truncate" style={{ maxWidth: 140 }}>{project.title}</span>}
        <span className="chip">{x.type}</span>
        <span className="caption faint" style={{ width: 80, textAlign: "right" }}>
          {formatDateDMY(x.updatedAt)}
        </span>
        <AreaDot area={a} />
      </button>
    );
  };

  const FileRow = ({ f }: { f: ResourceFile }) => (
    <div className="task-row" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", "file:" + f.id)}>
      <span className="faint" style={{ display: "inline-flex" }}>
        {fileIcon(f)}
      </span>
      <a className="grow truncate" href={`/api/resources/files/${f.id}/content`} target="_blank" rel="noreferrer">
        {f.title}
      </a>
      {f.tags.slice(0, 3).map((t) => (
        <span key={t} className="chip">
          {t}
        </span>
      ))}
      <span className="caption faint" style={{ width: 80, textAlign: "right" }}>
        {f.createdAt ? formatDateDMY(f.createdAt) : ""}
      </span>
      <button
        className="icon-btn"
        aria-label={`More for ${f.title}`}
        onClick={(e) =>
          drop(e, [
            {
              label: "Rename",
              onClick: () => {
                const t = prompt("Rename file", f.title)?.trim();
                if (t) api(`/api/resources/files/${f.id}`, json("PATCH", { title: t }));
              },
            },
            {
              label: "Edit tags",
              onClick: () => {
                const t = prompt("Tags, comma separated", f.tags.join(", "));
                if (t != null) api(`/api/resources/files/${f.id}`, json("PATCH", { tags: t.split(",").map((x) => x.trim()).filter(Boolean) }));
              },
            },
            ...(f.folderId ? [{ label: "Move to top level", onClick: () => moveFile(f.id, null) }] : []),
            { sep: true, label: "" },
            { label: "Delete", danger: true, onClick: () => confirm(`Delete “${f.title}” for good?`) && api(`/api/resources/files/${f.id}`, { method: "DELETE" }) },
          ])
        }
      >
        <DotsThree size={18} />
      </button>
    </div>
  );

  const folderCard = (f: { id: string; name: string }): Card => ({
    key: "res:" + f.id,
    name: f.name,
    kind: "Folder",
    count: live.files.filter((x) => x.folderId === f.id).length + live.folders.filter((x) => x.parentId === f.id).length,
    icon: <Folder size={18} weight="duotone" />,
    folderId: f.id,
  });
  const rootCards: Card[] = [
    ...s.areas.filter((a) => a.active && !a.archivedAt && match(a.id)).map((a) => ({ key: "area:" + a.id, name: a.name, kind: "Notes", count: notes.filter((x) => x.areaId === a.id).length, color: a.color, icon: <NotePencil size={18} weight="duotone" /> })),
    ...cols.map((c) => ({ key: "col:" + c.id, name: c.name, kind: c.description || "Collection", count: s.items.filter((i) => i.collectionId === c.id && !i.archivedAt).length, color: s.areas.find((a) => a.id === c.areaId)?.color, icon: <IconByName name={c.icon} weight="duotone" />, cover: c.cover })),
    ...live.folders.filter((f) => !f.parentId).map(folderCard),
  ];

  const Cards = ({ cards }: { cards: Card[] }) => (
    <div className="grid-cards" style={{ marginBottom: 20 }}>
      {cards.map((c) => (
        <button
          key={c.key}
          className="folder"
          style={{ "--c": c.color, ...(over === c.key ? { boxShadow: "0 0 0 2px var(--accent)" } : {}) } as CSSProperties}
          onClick={() => setOpen(c.key as Open)}
          draggable={!!c.folderId}
          onDragStart={(e) => c.folderId && e.dataTransfer.setData("text/plain", "folder:" + c.folderId)}
          {...(c.key.startsWith("col:") ? {} : target(c.key))}
        >
          {c.cover && <div className="card-cover" style={{ background: coverCss(c.cover) }} />}
          <span className="folder-icon">{c.icon}</span>
          <span className="headline truncate">{c.name}</span>
          <span className="caption muted truncate">{c.kind}</span>
          <span className="count">{c.count}</span>
          {c.folderId && (
            <span
              role="button"
              tabIndex={0}
              className="icon-btn"
              style={{ position: "absolute", top: 8, right: 8 }}
              aria-label={`More for ${c.name}`}
              onClick={(e) =>
                drop(e, [
                  {
                    label: "Rename",
                    onClick: () => {
                      const t = prompt("Rename folder", c.name)?.trim();
                      if (t) api(`/api/resources/folders/${c.folderId}`, json("PATCH", { name: t }));
                    },
                  },
                  { label: "Delete with everything inside", danger: true, onClick: () => confirm(`Delete “${c.name}” and every file in it for good?`) && api(`/api/resources/folders/${c.folderId}`, { method: "DELETE" }) },
                ])
              }
            >
              <DotsThree size={18} />
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const title = open?.startsWith("area:") ? s.areas.find((a) => a.id === open.slice(5))?.name : live.folders.find((f) => f.id === resId)?.name;
  const parent = live.folders.find((f) => f.id === resId)?.parentId ?? null;
  const inArea = open?.startsWith("area:") ? notes.filter((x) => x.areaId === open.slice(5) && (type === "all" || x.type === type)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1)) : [];
  const files = live.files.filter((f) => (f.folderId ?? null) === resId);
  const pinned = notes.filter((x) => x.pinned);

  return (
    <>
      <Toolbar title="Library">
        <div className="row sb-search" style={{ width: 260, margin: 0 }}>
          <MagnifyingGlass size={14} />
          <input className="input-bare callout" placeholder="Search notes, files, collections" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn" onClick={addMenu}>
          <Plus size={14} /> Add
        </button>
      </Toolbar>
      <Fade className="canvas" k={open ?? (q ? "q" : "root")}>
        <div style={{ minHeight: "70vh" }} {...(col || open?.startsWith("area:") ? {} : target(resId ? "res:" + resId : "res:root"))}>
          {hits ? (
            <>
              <h1 className="display-xl" style={{ marginBottom: 20 }}>
                “{q}”
              </h1>
              <div className="card" style={{ padding: 8, marginBottom: 16 }}>
                <div className="label" style={{ padding: 8 }}>Notes · {hits.notes.length}</div>
                {hits.notes.map((x) => (
                  <NoteRow key={x.id} id={x.id} />
                ))}
              </div>
              <div className="card" style={{ padding: 8, marginBottom: 16 }}>
                <div className="label" style={{ padding: 8 }}>Collection items · {hits.items.length}</div>
                {hits.items.map((i) => (
                  <button key={i.id} className="task-row" style={{ width: "100%" }} onClick={() => inspect({ kind: "item", id: i.id })}>
                    <span className="grow truncate" style={{ textAlign: "left" }}>
                      {i.title}
                    </span>
                    <span className="caption muted">{s.collections.find((c) => c.id === i.collectionId)?.name}</span>
                  </button>
                ))}
              </div>
              <div className="card" style={{ padding: 8 }}>
                <div className="label" style={{ padding: 8 }}>Files · {hits.files.length}</div>
                {hits.files.map((f) => (
                  <FileRow key={f.id} f={f} />
                ))}
              </div>
            </>
          ) : col ? (
            <CollectionView c={col} onBack={() => setOpen(null)} />
          ) : open ? (
            <>
              <div className="row head-row" style={{ marginBottom: 20 }}>
                <button className="icon-btn" aria-label="Back" onClick={() => setOpen(resId && parent ? `res:${parent}` : null)}>
                  <ArrowLeft size={18} />
                </button>
                <h1 className="display-xl">{title}</h1>
                <span className="spacer" />
                {open.startsWith("area:") ? (
                  <>
                    <Segmented label="Type" size="sm" value={type} onChange={setType} options={[{ value: "all", label: "All" }, { value: "doc", label: "Docs" }, { value: "plan", label: "Plans" }, { value: "meeting", label: "Meetings" }, { value: "reference", label: "Reference" }]} />
                    <button className="btn" onClick={newNote}>
                      <Plus size={14} /> Note
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn" onClick={newFolder}>
                      <FolderPlus size={14} /> Folder
                    </button>
                    <button className="btn" onClick={pick}>
                      <UploadSimple size={14} /> Upload
                    </button>
                  </>
                )}
              </div>
              {resId && <Cards cards={live.folders.filter((f) => f.parentId === resId).map(folderCard)} />}
              <div className="card" style={{ padding: 8 }}>
                {inArea.map((x) => (
                  <NoteRow key={x.id} id={x.id} />
                ))}
                {resId && files.map((f) => <FileRow key={f.id} f={f} />)}
                {inArea.length === 0 && (!resId || files.length === 0) && <Empty text={resId ? "Empty folder. Drop files here to upload." : "No notes here yet."} action={resId ? "Upload" : "New note"} onAction={resId ? pick : newNote} />}
              </div>
            </>
          ) : (
            <>
              <header className="page-head">
                <div>
                  <h1 className="display-xl">Library</h1>
                  <p className="callout muted" style={{ maxWidth: 720 }}>
                    Everything you keep, in one place: notes by area, collections (lists with your own fields, like games, books or ideas) and folders of files. Drop any file on the page to upload it. Drag notes, files and folders onto a folder to move them.
                  </p>
                </div>
              </header>
              <Cards cards={rootCards} />
              {files.length > 0 && (
                <div className="card" style={{ padding: 8, marginBottom: 16 }}>
                  <div className="label" style={{ padding: 8 }}>Loose files · {files.length}</div>
                  {files.map((f) => (
                    <FileRow key={f.id} f={f} />
                  ))}
                </div>
              )}
              {pinned.length > 0 && (
                <div className="card" style={{ padding: 8 }}>
                  <div className="label" style={{ padding: 8 }}>Pinned</div>
                  {pinned.map((x) => (
                    <NoteRow key={x.id} id={x.id} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Fade>
      <NewCollection open={creating} onClose={() => setCreating(false)} onCreated={(id) => setOpen(`col:${id}`)} />
    </>
  );
}
