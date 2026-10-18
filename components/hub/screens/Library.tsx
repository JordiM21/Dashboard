"use client";

/** Library (§5.7): notes per Area/Project with full-text search, external links out, and the academy resource tree. */
import { useMemo, useState, type CSSProperties } from "react";
import { MagnifyingGlass, Plus, PushPin, ArrowSquareOut, FileText, Image as ImageIcon, Folder, ArrowLeft, NotePencil } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { formatDateDMY } from "@/lib/hub/util";
import type { NoteType } from "@/lib/hub/types";
import { Toolbar, useArea, useShell } from "../Shell";
import { Empty, Fade, Segmented, AreaDot, IconByName } from "../ui";

type Folder_ = { key: string; name: string; count: number; color?: string; icon: React.ReactNode };

export default function Library() {
  const s = useHub();
  const live = useLive();
  const { match, area } = useArea();
  const { inspect } = useShell();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [type, setType] = useState<NoteType | "all">("all");

  const notes = useMemo(() => s.notes.filter((n) => !n.archivedAt && match(n.areaId)), [s.notes, match]);
  const n = q.toLowerCase();
  const hits = q
    ? {
        notes: notes.filter((x) => (x.title + " " + x.body).toLowerCase().includes(n)),
        files: live.files.filter((f) => (f.title + " " + f.description + " " + f.tags.join(" ")).toLowerCase().includes(n)),
      }
    : null;

  const folders: Folder_[] = [
    ...s.areas.filter((a) => match(a.id)).map((a) => ({ key: "area:" + a.id, name: a.name, count: notes.filter((x) => x.areaId === a.id).length, color: a.color, icon: <NotePencil size={18} weight="duotone" /> })),
    ...(match("let") ? live.folders.filter((f) => !f.parentId).map((f) => ({ key: "res:" + f.id, name: f.name, count: live.files.filter((x) => x.folderId === f.id).length, color: "var(--accent)", icon: <Folder size={18} weight="duotone" /> })) : []),
  ];

  const newNote = () => inspect({ kind: "note", id: A.addNote({ title: "Untitled", areaId: folder?.startsWith("area:") ? folder.slice(5) : area === "all" ? "let" : area }).id });

  const NoteRow = ({ id }: { id: string }) => {
    const x = s.notes.find((y) => y.id === id)!;
    const a = s.areas.find((y) => y.id === x.areaId);
    const project = s.projects.find((p) => p.id === x.projectId);
    return (
      <button className="task-row" style={{ width: "100%" }} onClick={() => inspect({ kind: "note", id: x.id })}>
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
  const FileRow = ({ id }: { id: string }) => {
    const f = live.files.find((y) => y.id === id)!;
    return (
      <a className="task-row" href={`/api/resources/files/${f.id}/content`} target="_blank" rel="noreferrer">
        {f.mimeType.startsWith("image") ? <ImageIcon size={16} className="faint" /> : <FileText size={16} className="faint" />}
        <span className="grow truncate">{f.title}</span>
        {f.tags.slice(0, 3).map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
        <ArrowSquareOut size={14} className="faint" />
      </a>
    );
  };

  const inFolder = folder?.startsWith("area:")
    ? notes.filter((x) => x.areaId === folder.slice(5) && (type === "all" || x.type === type)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1))
    : [];
  const subfolders = folder?.startsWith("res:") ? live.folders.filter((f) => f.parentId === folder.slice(4)) : [];
  const files = folder?.startsWith("res:") ? live.files.filter((f) => f.folderId === folder.slice(4)) : [];
  const pinned = notes.filter((x) => x.pinned);

  return (
    <>
      <Toolbar title="Library">
        <div className="row sb-search" style={{ width: 260, margin: 0 }}>
          <MagnifyingGlass size={14} />
          <input className="input-bare callout" placeholder="Search notes and resources" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn" onClick={newNote}>
          <Plus size={14} /> Note
        </button>
      </Toolbar>
      <Fade className="canvas" k={folder ?? (q ? "q" : "root")}>
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
            <div className="card" style={{ padding: 8 }}>
              <div className="label" style={{ padding: 8 }}>Academy resources · {hits.files.length}</div>
              {hits.files.map((f) => (
                <FileRow key={f.id} id={f.id} />
              ))}
            </div>
          </>
        ) : folder ? (
          <>
            <div className="row head-row" style={{ marginBottom: 20 }}>
              <button className="icon-btn" aria-label="Back" onClick={() => setFolder(null)}>
                <ArrowLeft size={18} />
              </button>
              <h1 className="display-xl">{folders.find((f) => f.key === folder)?.name ?? live.folders.find((f) => "res:" + f.id === folder)?.name}</h1>
              <span className="spacer" />
              {folder.startsWith("area:") && <Segmented label="Type" size="sm" value={type} onChange={setType} options={[{ value: "all", label: "All" }, { value: "doc", label: "Docs" }, { value: "plan", label: "Plans" }, { value: "meeting", label: "Meetings" }, { value: "reference", label: "Reference" }]} />}
            </div>
            {subfolders.length > 0 && (
              <div className="grid-cards" style={{ marginBottom: 16 }}>
                {subfolders.map((f) => (
                  <button key={f.id} className="folder" onClick={() => setFolder("res:" + f.id)}>
                    <span className="folder-icon">
                      <Folder size={18} weight="duotone" />
                    </span>
                    <span className="headline">{f.name}</span>
                    <span className="count">{live.files.filter((x) => x.folderId === f.id).length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="card" style={{ padding: 8 }}>
              {inFolder.map((x) => (
                <NoteRow key={x.id} id={x.id} />
              ))}
              {files.map((f) => (
                <FileRow key={f.id} id={f.id} />
              ))}
              {inFolder.length === 0 && files.length === 0 && <Empty text="Nothing here yet." action={folder.startsWith("area:") ? "New note" : undefined} onAction={newNote} />}
            </div>
          </>
        ) : (
          <>
            <header className="page-head">
              <div>
                <h1 className="display-xl">Library</h1>
                <p className="callout muted">Hub keeps structured notes; long-form thinking stays in Obsidian and opens from here.</p>
              </div>
            </header>
            <div className="grid-cards" style={{ marginBottom: 28 }}>
              {folders.map((f) => (
                <button key={f.key} className="folder" style={{ "--c": f.color } as CSSProperties} onClick={() => setFolder(f.key)}>
                  <span className="folder-icon">{f.icon}</span>
                  <span className="headline">{f.name}</span>
                  <span className="caption muted">{f.key.startsWith("res:") ? "Academy resources" : "Notes"}</span>
                  <span className="count">{f.count}</span>
                </button>
              ))}
            </div>
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
      </Fade>
    </>
  );
}
