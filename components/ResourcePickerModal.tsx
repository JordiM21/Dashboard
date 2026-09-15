"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { fileCategory, fileIcon } from "@/lib/resourceUtils";
import type { ResourceFile, ResourceFolder } from "@/lib/types";

/**
 * "Link a lesson to a file already in Resources" — instead of hunting down
 * a URL and pasting it, pick the file itself. Flat across every folder (a
 * teacher recalling "that HTML page" rarely remembers which folder it's
 * in), searchable, with the same live preview tiles Resources itself uses —
 * an HTML file shows its actual rendered page, not a generic file icon.
 */
export default function ResourcePickerModal({ onClose, onPick }: { onClose: () => void; onPick: (file: ResourceFile) => void }) {
  const { data: filesData, error } = useFirestoreCollection<ResourceFile>("resourceFiles", {
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
  const { data: foldersData } = useFirestoreCollection<ResourceFolder>("resourceFolders", { orderByField: "createdAt" });
  const [search, setSearch] = useState("");

  const folderName = useMemo(() => {
    const map = new Map((foldersData ?? []).map((f) => [f.id, f.name]));
    return (folderId: string | null) => (folderId ? map.get(folderId) ?? "—" : "All Resources");
  }, [foldersData]);

  const files = useMemo(() => {
    const list = filesData ?? [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((f) => f.title.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q)));
  }, [filesData, search]);

  return (
    <Modal title="Link a resource file" onClose={onClose} maxWidth={640}>
      <input
        type="text"
        autoFocus
        placeholder="Search Resources by name or tag…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {error && <FetchFailedState message={error} />}
      {!error && filesData && files.length === 0 && (
        <EmptyState title="No files match" hint="Try a different search, or paste a link instead." />
      )}

      {!error && files.length > 0 && (
        <div className="resource-picker-grid">
          {files.map((file) => {
            const category = fileCategory(file.mimeType, file.originalName);
            return (
              <button key={file.id} type="button" className="resource-picker-item" onClick={() => onPick(file)}>
                <span className="resource-picker-thumb">
                  {category === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/resources/files/${file.id}/content`} alt="" loading="lazy" />
                  ) : category === "html" ? (
                    <iframe
                      src={`/api/resources/files/${file.id}/content`}
                      title={file.title}
                      loading="lazy"
                      sandbox=""
                      className="resource-tile-html-preview"
                      style={{ ["--tile-size" as string]: "72px" }}
                      tabIndex={-1}
                    />
                  ) : (
                    <span aria-hidden>{fileIcon(category)}</span>
                  )}
                </span>
                <span className="resource-picker-text">
                  <span className="resource-picker-title">{file.title}</span>
                  <span className="resource-picker-meta">{folderName(file.folderId)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
