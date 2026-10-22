"use client";

/**
 * Library: one place for everything you keep — notes (one folder per Area),
 * collections (lists with your own fields) and files of any type in folders
 * you make. Drop files anywhere to upload; drag notes and files onto a card
 * to move them, drag a card onto another card to reorder. Every card's icon
 * and colour is clickable; its ⋯ menu renames, moves and deletes.
 */
import { useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { MagnifyingGlass, Plus, PushPin, ArrowSquareOut, FileText, Image as ImageIcon, ArrowLeft, NotePencil, DotsThree, UploadSimple, FolderPlus, SquaresFour, FileVideo, FilePdf, X, Hash, PencilSimple, Trash } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { toast } from "@/lib/hub/fx";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY } from "@/lib/hub/util";
import type { NoteType, Settings } from "@/lib/hub/types";
import type { ResourceFile, ResourceFolder } from "@/lib/types";
import { Toolbar, useArea, useShell } from "../Shell";
import { Empty, Fade, Segmented, AreaDot, IconByName, useDropdown, type MenuItem } from "../ui";
import { IconPicker, Popover, coverCss } from "../Customize";
import { CollectionView, NewCollection } from "./Collections";

/** What's open: the root (null), an Area's notes, a file folder, or a collection. */
type Open = null | `area:${string}` | `res:${string}` | `col:${string}`;
type Sort = NonNullable<Settings["librarySort"]>;

async function api(path: string, init: RequestInit): Promise<boolean> {
  const r = await authFetch(path, init).catch(() => null);
  if (!r?.ok) toast(r?.status === 401 ? "Sign in to change files" : "That didn’t save. Try again.");
  return !!r?.ok;
}
const json = (method: string, body: object): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patchFolder = (id: string, body: Partial<ResourceFolder>) => api(`/api/resources/folders/${id}`, json("PATCH", body));
const latest = (...isos: (string | undefined)[]) => isos.reduce<string>((m, x) => (x && x > m ? x : m), "");

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

type Card = { key: string; name: string; kind: string; count: number; updated: string; icon: string; color?: string; cover?: string; onIcon: (v: string) => void; onColor: (v: string) => void; menu: MenuItem[] };

export default function Library() {
  const s = useHub();
  const live = useLive();
  const { match, area, areas } = useArea();
  const { inspect } = useShell();
  const drop = useDropdown();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagQ, setTagQ] = useState("");
  const tagBtn = useRef<HTMLButtonElement>(null);
  /** [tag, uses] across notes, items and files, most used first. */
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    [...s.notes, ...s.items].filter((x) => !x.archivedAt).flatMap((x) => x.tags ?? []).concat(live.files.flatMap((f) => f.tags)).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [s.notes, s.items, live.files]);
  const [open, setOpen] = useState<Open>(null);
  const [type, setType] = useState<NoteType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [editCol, setEditCol] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const sort: Sort = s.settings.librarySort ?? "manual";
  const order = s.settings.libraryOrder ?? [];

  const notes = useMemo(() => s.notes.filter((n) => !n.archivedAt && match(n.areaId)), [s.notes, match]);
  const cols = s.collections.filter((c) => !c.archivedAt && match(c.areaId));
  const folders = live.folders.filter((f) => !f.areaId || match(f.areaId));
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
  const moveFolder = (id: string, parentId: string | null) => patchFolder(id, { parentId });
  /** "Move to <area>" entries, minus the current one. */
  const areaMoves = (current: string | null | undefined, set: (id: string | null) => void, everywhere = false): MenuItem[] => [
    { sep: true, label: "" },
    ...areas.filter((a) => a.id !== current).map((a) => ({ label: `Move to ${a.name}`, icon: <AreaDot area={a} />, onClick: () => set(a.id) })),
    ...(everywhere && current ? [{ label: "Show in every area", onClick: () => set(null) }] : []),
  ];
  /** "Into <folder>" entries; `skip` is the folder being moved (the API refuses cycles). */
  const folderMoves = (current: string | null, set: (id: string | null) => void, skip?: string): MenuItem[] => [
    { sep: true, label: "" },
    ...(current ? [{ label: "Move to top level", onClick: () => set(null) }] : []),
    ...live.folders.filter((f) => f.id !== current && f.id !== skip).map((f) => ({ label: `Into ${f.name}`, icon: <IconByName name={f.icon ?? "Folder"} size={16} />, onClick: () => set(f.id) })),
  ];
  const rename = (label: string, name: string, set: (v: string) => void) => {
    const t = prompt(label, name)?.trim();
    if (t) set(t);
  };

  /** Puts `from` where `to` sits among `keys` (the cards as shown) and switches to manual order. */
  const reorder = (from: string, to: string, keys: string[]) => {
    if (from === to || !keys.includes(from)) return;
    const next = keys.filter((k) => k !== from);
    next.splice(keys.indexOf(to), 0, from);
    A.setSettings({ librarySort: "manual", libraryOrder: [...next, ...order.filter((k) => !next.includes(k))] });
  };

  /** Drop targets: an Area folder takes notes; a file folder ("res:root" = top level) takes files and folders; a card takes other cards (reorder). Files from your computer upload wherever they land. */
  const target = (key: string, keys?: string[]) => ({
    onDragOver: (e: DragEvent) => (e.preventDefault(), e.stopPropagation(), setOver(key)),
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      const into = key === "res:root" ? null : key.slice(4);
      if (e.dataTransfer.files.length) return void upload(e.dataTransfer.files, key.startsWith("res:") ? into : resId);
      const id = e.dataTransfer.getData("text/plain");
      if (id.startsWith("card:") && keys) return reorder(id.slice(5), key, keys);
      if (id.startsWith("note:") && key.startsWith("area:")) A.updateNote(id.slice(5), { areaId: key.slice(5) });
      if (id.startsWith("file:") && key.startsWith("res:")) moveFile(id.slice(5), into);
      if (id.startsWith("card:res:") && key.startsWith("res:") && id.slice(9) !== into) moveFolder(id.slice(9), into);
    },
  });

  const n = q.toLowerCase();
  const has = (t?: string[]) => !tag || !!t?.includes(tag);
  const hits =
    q || tag
      ? {
          notes: notes.filter((x) => has(x.tags) && (x.title + " " + x.body + " " + (x.tags ?? []).join(" ")).toLowerCase().includes(n)),
          files: live.files.filter((f) => has(f.tags) && (f.title + " " + f.description + " " + f.tags.join(" ")).toLowerCase().includes(n)),
          items: s.items.filter((i) => !i.archivedAt && has(i.tags) && cols.some((c) => c.id === i.collectionId) && (i.title + " " + (i.tags ?? []).join(" ")).toLowerCase().includes(n)),
        }
      : null;

  /** Renames a tag everywhere, or removes it everywhere when `to` is null. */
  const retag = (from: string, to: string | null) => {
    const fix = (t?: string[]) => (t?.includes(from) ? [...new Set(t.flatMap((x) => (x === from ? (to ? [to] : []) : [x])))] : null);
    s.notes.forEach((x) => fix(x.tags) && A.updateNote(x.id, { tags: fix(x.tags)! }));
    s.items.forEach((x) => fix(x.tags) && A.updateItem(x.id, { tags: fix(x.tags)! }));
    live.files.forEach((f) => fix(f.tags) && api(`/api/resources/files/${f.id}`, json("PATCH", { tags: fix(f.tags) })));
    if (tag === from) setTag(to);
  };
  const tq = tagQ.trim().toLowerCase();
  const tagHits = tq ? tagCounts.filter(([t]) => t.toLowerCase().includes(tq)) : tagCounts.slice(0, 8);
  const tagPicker = (
    <>
      <button ref={tagBtn} className="btn" style={tag ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" } : undefined} onClick={() => setTagOpen(!tagOpen)} aria-expanded={tagOpen}>
        <Hash size={14} /> {tag ?? "Tags"}
      </button>
      <Popover anchor={tagBtn.current} open={tagOpen} onClose={() => setTagOpen(false)} width={280}>
        <div className="row sb-search" style={{ margin: "2px 2px 8px" }}>
          <MagnifyingGlass size={14} />
          <input ref={(el) => { if (el && tagOpen && !el.dataset.f) (el.dataset.f = "1"), requestAnimationFrame(() => el.focus()); }} className="input-bare callout" placeholder="Search tags" value={tagQ} onChange={(e) => setTagQ(e.target.value)} />
        </div>
        {tag && (
          <button className="menu-item" onClick={() => (setTag(null), setTagOpen(false))}>
            <X size={14} /> Clear #{tag}
          </button>
        )}
        <div className="label" style={{ padding: "6px 8px" }}>{tq ? `Matches · ${tagHits.length}` : "Most used"}</div>
        {tagHits.map(([t, count]) => (
          <div key={t} className="row" style={{ gap: 2 }}>
            <button className="menu-item grow" aria-pressed={tag === t} style={tag === t ? { color: "var(--accent)" } : undefined} onClick={() => (setTag(t), setTagOpen(false), setTagQ(""))}>
              <span className="grow truncate" style={{ textAlign: "left" }}>#{t}</span>
              <span className="caption faint">{count}</span>
            </button>
            <button className="icon-btn" aria-label={`Rename tag ${t}`} title="Rename everywhere" onClick={() => rename("Rename tag", t, (v) => retag(t, v))}>
              <PencilSimple size={14} />
            </button>
            <button className="icon-btn" aria-label={`Remove tag ${t}`} title="Remove from everything" onClick={() => confirm(`Remove the tag “${t}” from every note, item and file?`) && retag(t, null)}>
              <Trash size={14} />
            </button>
          </div>
        ))}
        {tagHits.length === 0 && <p className="caption muted" style={{ padding: "4px 8px 8px", margin: 0 }}>{tq ? `No tag “${tagQ.trim()}” yet. Add it from a note’s or item’s panel.` : "No tags yet. Add them from a note’s or item’s panel."}</p>}
      </Popover>
    </>
  );

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
        {(x.tags ?? []).slice(0, 3).map((t) => (
          <span key={t} className="chip">
            #{t}
          </span>
        ))}
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
          #{t}
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
            { label: "Rename", onClick: () => rename("Rename file", f.title, (title) => api(`/api/resources/files/${f.id}`, json("PATCH", { title }))) },
            {
              label: "Edit tags",
              onClick: () => {
                const t = prompt("Tags, comma separated", f.tags.join(", "));
                if (t != null) api(`/api/resources/files/${f.id}`, json("PATCH", { tags: [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))] }));
              },
            },
            ...folderMoves(f.folderId ?? null, (to) => moveFile(f.id, to)),
            { sep: true, label: "" },
            { label: "Delete", danger: true, onClick: () => confirm(`Delete “${f.title}” for good?`) && api(`/api/resources/files/${f.id}`, { method: "DELETE" }) },
          ])
        }
      >
        <DotsThree size={18} />
      </button>
    </div>
  );

  const folderCard = (f: ResourceFolder): Card => {
    const inside = live.files.filter((x) => x.folderId === f.id);
    return {
      key: "res:" + f.id,
      name: f.name,
      kind: "Folder",
      count: inside.length + live.folders.filter((x) => x.parentId === f.id).length,
      updated: latest(f.createdAt, ...inside.map((x) => x.updatedAt)),
      icon: f.icon ?? "Folder",
      color: f.color ?? s.areas.find((a) => a.id === f.areaId)?.color,
      onIcon: (icon) => patchFolder(f.id, { icon }),
      onColor: (color) => patchFolder(f.id, { color }),
      menu: [
        { label: "Rename", onClick: () => rename("Rename folder", f.name, (name) => patchFolder(f.id, { name })) },
        ...areaMoves(f.areaId, (areaId) => patchFolder(f.id, { areaId }), true),
        ...folderMoves(f.parentId, (to) => moveFolder(f.id, to), f.id),
        { sep: true, label: "" },
        { label: "Delete with everything inside", danger: true, onClick: () => confirm(`Delete “${f.name}” and every file in it for good?`) && api(`/api/resources/folders/${f.id}`, { method: "DELETE" }) },
      ],
    };
  };
  const rootCards: Card[] = [
    ...s.areas
      .filter((a) => a.active && !a.archivedAt && match(a.id))
      .map((a): Card => {
        const mine = notes.filter((x) => x.areaId === a.id);
        return {
          key: "area:" + a.id,
          name: a.name,
          kind: "Notes",
          count: mine.length,
          updated: latest(a.updatedAt, ...mine.map((x) => x.updatedAt)),
          icon: a.icon,
          color: a.color,
          onIcon: (icon) => A.updateArea(a.id, { icon }),
          onColor: (color) => A.updateArea(a.id, { color }),
          menu: [
            { label: "Rename area", onClick: () => rename("Rename area", a.name, (name) => A.updateArea(a.id, { name })) },
            { label: "New note here", icon: <NotePencil size={16} />, onClick: () => inspect({ kind: "note", id: A.addNote({ title: "Untitled", areaId: a.id }).id }) },
          ],
        };
      }),
    ...cols.map((c): Card => {
      const items = s.items.filter((i) => i.collectionId === c.id && !i.archivedAt);
      return {
        key: "col:" + c.id,
        name: c.name,
        kind: c.description || "Collection",
        count: items.length,
        updated: latest(c.updatedAt, ...items.map((i) => i.updatedAt)),
        icon: c.icon,
        color: c.color ?? s.areas.find((a) => a.id === c.areaId)?.color,
        cover: c.cover,
        onIcon: (icon) => A.updateCollection(c.id, { icon }),
        onColor: (color) => A.updateCollection(c.id, { color }),
        menu: [
          { label: "Rename", onClick: () => rename("Rename collection", c.name, (name) => A.updateCollection(c.id, { name })) },
          { label: "Edit fields", onClick: () => setEditCol(c.id) },
          ...areaMoves(c.areaId, (areaId) => areaId && A.updateCollection(c.id, { areaId })),
          { sep: true, label: "" },
          { label: "Delete", danger: true, onClick: () => A.archive("collections", c.id, `Deleted “${c.name}”`) },
        ],
      };
    }),
    ...folders.filter((f) => !f.parentId).map(folderCard),
  ];

  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : Infinity);
  const sorted = (cards: Card[]) =>
    [...cards].sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : sort === "updated" ? (a, b) => b.updated.localeCompare(a.updated) : sort === "count" ? (a, b) => b.count - a.count : (a, b) => rank(a.key) - rank(b.key));

  const cardGrid = (raw: Card[]) => {
    const cards = sorted(raw);
    const keys = cards.map((c) => c.key);
    return (
      <div className="grid-cards" style={{ marginBottom: 20 }}>
        {cards.map((c) => (
          <div
            key={c.key}
            role="button"
            tabIndex={0}
            className="folder"
            style={{ cursor: "pointer", "--c": c.color, ...(over === c.key ? { boxShadow: "0 0 0 2px var(--accent)" } : {}) } as CSSProperties}
            onClick={() => setOpen(c.key as Open)}
            onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setOpen(c.key as Open)}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", "card:" + c.key)}
            {...target(c.key, keys)}
          >
            {c.cover && <div className="card-cover" style={{ background: coverCss(c.cover) }} />}
            <span style={{ alignSelf: "flex-start" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <IconPicker icon={c.icon} color={c.color} size={34} onIcon={c.onIcon} onColor={c.onColor} label={`Icon and colour for ${c.name}`} />
            </span>
            <span className="headline truncate">{c.name}</span>
            <span className="caption muted truncate">{c.kind}</span>
            <span className="count">{c.count}</span>
            <button className="icon-btn" style={{ position: "absolute", top: 8, right: 8 }} aria-label={`More for ${c.name}`} onClick={(e) => drop(e, c.menu)}>
              <DotsThree size={18} />
            </button>
          </div>
        ))}
      </div>
    );
  };
  /** One kind of thing per section, so it's clear where to look. Drag-reordering stays within a section. */
  const section = (label: string, hint: string, cards: Card[], add: { label: string; onClick: () => void }, extra?: ReactNode) => (
    <section style={{ marginBottom: 28 }}>
      <div className="row" style={{ marginBottom: 6, gap: 10 }}>
        <span className="headline">{label}</span>
        <span className="caption faint">{cards.length}</span>
        <span className="caption muted truncate">{hint}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={add.onClick}>
          <Plus size={14} /> {add.label}
        </button>
      </div>
      {cards.length > 0 && cardGrid(cards)}
      {extra}
    </section>
  );

  const title = open?.startsWith("area:") ? s.areas.find((a) => a.id === open.slice(5))?.name : live.folders.find((f) => f.id === resId)?.name;
  const parent = live.folders.find((f) => f.id === resId)?.parentId ?? null;
  const inArea = open?.startsWith("area:") ? notes.filter((x) => x.areaId === open.slice(5) && (type === "all" || x.type === type)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1)) : [];
  const files = live.files.filter((f) => (f.folderId ?? null) === resId);
  const pinned = notes.filter((x) => x.pinned);
  const editing = s.collections.find((c) => c.id === editCol);

  return (
    <>
      <Toolbar title="Library">
        <div className="row sb-search" style={{ width: 260, margin: 0 }}>
          <MagnifyingGlass size={14} />
          <input className="input-bare callout" placeholder="Search notes, files, collections" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {tagPicker}
        <button className="btn" onClick={addMenu}>
          <Plus size={14} /> Add
        </button>
      </Toolbar>
      <Fade className="canvas" k={open ?? (hits ? "q" : "root")}>
        <div style={{ minHeight: "70vh" }} {...(col || open?.startsWith("area:") ? {} : target(resId ? "res:" + resId : "res:root"))}>
          {hits ? (
            <>
              <h1 className="display-xl" style={{ marginBottom: 20 }}>
                {[q && `“${q}”`, tag && `#${tag}`].filter(Boolean).join(" · ")}
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
                    {(i.tags ?? []).slice(0, 3).map((t) => (
                      <span key={t} className="chip">
                        #{t}
                      </span>
                    ))}
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
              {resId && cardGrid(folders.filter((f) => f.parentId === resId).map(folderCard))}
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
                    Notes, collections and files. Drop a file anywhere to upload, drag cards to reorder.
                  </p>
                </div>
                <Segmented
                  label="Sort"
                  size="sm"
                  value={sort}
                  onChange={(librarySort) => A.setSettings({ librarySort })}
                  options={[{ value: "manual", label: "Manual" }, { value: "name", label: "Name" }, { value: "updated", label: "Updated" }, { value: "count", label: "Items" }]}
                />
              </header>
              {pinned.length > 0 && (
                <div className="card" style={{ padding: 8, marginBottom: 28 }}>
                  <div className="label" style={{ padding: 8 }}>
                    <PushPin size={12} weight="fill" style={{ color: "var(--accent)", verticalAlign: -1, marginRight: 6 }} />
                    Pinned · {pinned.length}
                  </div>
                  {pinned.map((x) => (
                    <NoteRow key={x.id} id={x.id} />
                  ))}
                </div>
              )}
              {section("Notes", "One notebook per area", rootCards.filter((c) => c.key.startsWith("area:")), { label: "Note", onClick: newNote })}
              {section("Collections", "Lists with your own fields", rootCards.filter((c) => c.key.startsWith("col:")), { label: "Collection", onClick: () => setCreating(true) })}
              {section(
                "Folders",
                "Files you upload",
                rootCards.filter((c) => c.key.startsWith("res:")),
                { label: "Folder", onClick: newFolder },
                files.length > 0 && (
                  <div className="card" style={{ padding: 8 }}>
                    <div className="label" style={{ padding: 8 }}>Loose files · {files.length}</div>
                    {files.map((f) => (
                      <FileRow key={f.id} f={f} />
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </Fade>
      <NewCollection open={creating} onClose={() => setCreating(false)} onCreated={(id) => setOpen(`col:${id}`)} />
      <NewCollection open={!!editing} onClose={() => setEditCol(null)} edit={editing} />
    </>
  );
}
