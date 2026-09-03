"use client";

import { useMemo, useRef, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import Modal from "@/components/Modal";
import ViewToggle from "@/components/ViewToggle";
import LiveBadge from "@/components/LiveBadge";
import ResourceDetailModal from "@/components/ResourceDetailModal";
import CreateResourceModal from "@/components/CreateResourceModal";
import LoadingLabel from "@/components/LoadingLabel";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import type { ResourceFile, ResourceFolder } from "@/lib/types";
import { fileCategory, fileIcon, formatBytes, type FileCategory } from "@/lib/resourceUtils";
import { formatDateDMY } from "@/lib/dateUtils";

type SortKey = "name" | "date" | "size" | "type";
type DragPayload = { kind: "file" | "folder"; id: string };

const DRAG_MIME = "application/x-resource-drag";

/**
 * Files, folders, images, video, PDFs, markdown notes, and text files —
 * backed by Firebase Storage. Lives full-width inside the Classroom view's
 * "Resources" tab (see app/students/page.tsx) — there's no standalone
 * /resources route, this is the only place it's used.
 */
export default function ResourcesBrowser() {
  const {
    data: foldersData,
    error: foldersError,
    loading: foldersLoading,
    lastUpdated,
  } = useFirestoreCollection<ResourceFolder>("resourceFolders", { orderByField: "createdAt" });
  const { data: filesData, error: filesError } = useFirestoreCollection<ResourceFile>("resourceFiles", {
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
  const error = foldersError ?? filesError;
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("name");
  const [typeFilter, setTypeFilter] = useState<"all" | FileCategory>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tileSize, setTileSize] = useState(150);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [openFile, setOpenFile] = useState<ResourceFile | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | "up" | null>(null);
  const [osDragActive, setOsDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folders = foldersData ?? [];
  const files = filesData ?? [];

  const breadcrumbs = useMemo(() => {
    const trail: ResourceFolder[] = [];
    let cursor = currentFolderId;
    while (cursor) {
      const f = folders.find((x) => x.id === cursor);
      if (!f) break;
      trail.unshift(f);
      cursor = f.parentId;
    }
    return trail;
  }, [currentFolderId, folders]);

  const allTags = useMemo(() => Array.from(new Set(files.flatMap((f) => f.tags))).sort(), [files]);

  const childFolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId === currentFolderId)
        .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId, search]
  );

  const childFiles = useMemo(() => {
    let list = files.filter((f) => f.folderId === currentFolderId);
    if (typeFilter !== "all") list = list.filter((f) => fileCategory(f.mimeType, f.originalName) === typeFilter);
    if (tagFilter !== "all") list = list.filter((f) => f.tags.includes(tagFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    switch (sort) {
      case "name":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "date":
        sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        break;
      case "size":
        sorted.sort((a, b) => b.size - a.size);
        break;
      case "type":
        sorted.sort((a, b) => fileCategory(a.mimeType, a.originalName).localeCompare(fileCategory(b.mimeType, b.originalName)));
        break;
    }
    return sorted;
  }, [files, currentFolderId, typeFilter, tagFilter, search, sort]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await authFetch("/api/resources/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: currentFolderId }),
    });
    setNewFolderName("");
    setNewFolderOpen(false);
  }

  async function deleteFolderItem(id: string) {
    await authFetch(`/api/resources/folders/${id}`, { method: "DELETE" });
  }

  async function moveFile(id: string, folderId: string | null) {
    await authFetch(`/api/resources/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
  }

  async function moveFolder(id: string, parentId: string | null) {
    if (id === parentId) return;
    await authFetch(`/api/resources/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
  }

  async function deleteFileItem(id: string) {
    await authFetch(`/api/resources/files/${id}`, { method: "DELETE" });
    setOpenFile(null);
  }

  async function saveFileMeta(id: string, updates: { title: string; description: string; tags: string[] }) {
    await authFetch(`/api/resources/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setOpenFile(null);
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("folderId", currentFolderId ?? "null");
    arr.forEach((f) => formData.append("files", f));
    try {
      await authFetch("/api/resources/files", { method: "POST", body: formData });
    } finally {
      setUploading(false);
    }
  }

  function handleInternalDrop(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    setDragOverTarget(null);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const payload: DragPayload = JSON.parse(raw);
    if (payload.kind === "file") moveFile(payload.id, targetFolderId);
    else moveFolder(payload.id, targetFolderId);
  }

  function handleAreaDrop(e: React.DragEvent) {
    e.preventDefault();
    setOsDragActive(false);
    setDragOverTarget(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
      return;
    }
    handleInternalDrop(e, currentFolderId);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={() => setNewFolderOpen(true)}>
          + New Folder
        </button>
        <button className="btn btn-secondary" onClick={() => setCreateOpen(true)}>
          + Create
        </button>
        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <LoadingLabel loading={uploading}>+ Upload</LoadingLabel>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="Resources">
          <LiveBadge lastUpdated={lastUpdated} loading={foldersLoading} />
          <div className="breadcrumbs">
            <span
              className={`breadcrumb-item${currentFolderId === null ? " active" : ""}`}
              onClick={() => setCurrentFolderId(null)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget("up");
              }}
              onDragLeave={() => setDragOverTarget((t) => (t === "up" ? null : t))}
              onDrop={(e) => handleInternalDrop(e, null)}
              style={dragOverTarget === "up" ? { outline: "2px solid var(--accent)" } : undefined}
            >
              🏠 All Resources
            </span>
            {breadcrumbs.map((b) => (
              <span key={b.id} style={{ display: "inline-flex", alignItems: "center" }}>
                <span className="breadcrumb-sep">/</span>
                <span
                  className={`breadcrumb-item${b.id === currentFolderId ? " active" : ""}`}
                  onClick={() => setCurrentFolderId(b.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTarget(b.id);
                  }}
                  onDragLeave={() => setDragOverTarget((t) => (t === b.id ? null : t))}
                  onDrop={(e) => handleInternalDrop(e, b.id)}
                  style={dragOverTarget === b.id ? { outline: "2px solid var(--accent)" } : undefined}
                >
                  {b.name}
                </span>
              </span>
            ))}
          </div>

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search this folder…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="pdf">PDFs</option>
              <option value="markdown">Markdown</option>
              <option value="text">Text</option>
              <option value="document">Documents</option>
              <option value="other">Other</option>
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="name">Sort: Name</option>
              <option value="date">Sort: Newest</option>
              <option value="size">Sort: Largest</option>
              <option value="type">Sort: Type</option>
            </select>
            {view === "grid" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)" }}>
                Size
                <input
                  type="range"
                  min={100}
                  max={220}
                  value={tileSize}
                  onChange={(e) => setTileSize(Number(e.target.value))}
                  className="size-slider"
                />
              </label>
            )}
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "Grid" },
                { value: "list", label: "List" },
              ]}
            />
          </div>

          <div
            className={`resource-dropzone${osDragActive ? " resource-dropzone-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer.types.includes("Files")) setOsDragActive(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOsDragActive(false);
            }}
            onDrop={handleAreaDrop}
          >
            {childFolders.length === 0 && childFiles.length === 0 && (
              <EmptyState
                title="This folder is empty"
                hint="Drop files here to upload, or create a subfolder."
              />
            )}

            {view === "grid" && (childFolders.length > 0 || childFiles.length > 0) && (
              <div className="resource-grid" style={{ ["--tile-size" as any]: `${tileSize}px` }}>
                {childFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`resource-tile resource-tile-folder${dragOverTarget === folder.id ? " resource-tile-drop" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: "folder", id: folder.id }));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTarget(folder.id);
                    }}
                    onDragLeave={() => setDragOverTarget((t) => (t === folder.id ? null : t))}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleInternalDrop(e, folder.id);
                    }}
                    onClick={() => setCurrentFolderId(folder.id)}
                  >
                    <div className="resource-tile-thumb resource-tile-icon">📁</div>
                    <div className="resource-tile-title">{folder.name}</div>
                    <button
                      className="resource-tile-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolderItem(folder.id);
                      }}
                      aria-label={`Delete folder ${folder.name}`}
                      title="Delete folder"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {childFiles.map((file) => (
                  <div
                    key={file.id}
                    className="resource-tile"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: "file", id: file.id }));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setOpenFile(file)}
                  >
                    <div className="resource-tile-thumb">
                      {fileCategory(file.mimeType, file.originalName) === "image" ? (
                        <img src={`/api/resources/files/${file.id}/content`} alt={file.title} loading="lazy" />
                      ) : (
                        <span className="resource-tile-icon">{fileIcon(fileCategory(file.mimeType, file.originalName))}</span>
                      )}
                    </div>
                    <div className="resource-tile-title">{file.title}</div>
                    <div className="resource-tile-meta">{formatBytes(file.size)}</div>
                    {file.tags.length > 0 && (
                      <div className="resource-tile-tags">
                        {file.tags.slice(0, 2).map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {view === "list" && (childFolders.length > 0 || childFiles.length > 0) && (
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Tags</th>
                      <th>Size</th>
                      <th>Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childFolders.map((folder) => (
                      <tr
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        style={{ cursor: "pointer" }}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: "folder", id: folder.id }))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleInternalDrop(e, folder.id)}
                      >
                        <td>📁 {folder.name}</td>
                        <td>Folder</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{formatDateDMY(folder.createdAt)}</td>
                      </tr>
                    ))}
                    {childFiles.map((file) => (
                      <tr
                        key={file.id}
                        onClick={() => setOpenFile(file)}
                        style={{ cursor: "pointer" }}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: "file", id: file.id }))}
                      >
                        <td>
                          {fileIcon(fileCategory(file.mimeType, file.originalName))} {file.title}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>{fileCategory(file.mimeType, file.originalName)}</td>
                        <td>
                          {file.tags.map((t) => (
                            <span key={t} className="tag" style={{ marginRight: 4 }}>
                              {t}
                            </span>
                          ))}
                        </td>
                        <td>{formatBytes(file.size)}</td>
                        <td>{formatDateDMY(file.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ErrorBoundary>
      )}

      {newFolderOpen && (
        <Modal title="New Folder" onClose={() => setNewFolderOpen(false)}>
          <div className="form-row">
            <label>Folder name</label>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={createFolder}>
              Create
            </button>
          </div>
        </Modal>
      )}

      {createOpen && (
        <CreateResourceModal
          folderId={currentFolderId}
          onClose={() => setCreateOpen(false)}
          onCreated={(file) => {
            setCreateOpen(false);
            setOpenFile(file);
          }}
        />
      )}

      {openFile && (
        <ResourceDetailModal
          file={openFile}
          onClose={() => setOpenFile(null)}
          onSave={(updates) => saveFileMeta(openFile.id, updates)}
          onDelete={() => deleteFileItem(openFile.id)}
        />
      )}
    </div>
  );
}
