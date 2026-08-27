export type FileCategory = "image" | "video" | "pdf" | "markdown" | "text" | "document" | "other";

/** Categorizes by file extension first — browsers report inconsistent (or empty) mimeType for .md depending on OS, so the extension is the reliable signal for the types this app can view/edit inline. */
export function fileCategory(mimeType: string, originalName = ""): FileCategory {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (ext === "txt" || mimeType === "text/plain") return "text";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("presentation") ||
    mimeType.includes("spreadsheet")
  ) {
    return "document";
  }
  return "other";
}

export function fileIcon(category: FileCategory): string {
  switch (category) {
    case "image":
      return "🖼️";
    case "video":
      return "🎬";
    case "pdf":
      return "📕";
    case "markdown":
      return "📝";
    case "text":
      return "📄";
    case "document":
      return "📄";
    default:
      return "📦";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
