export type FileCategory = "image" | "video" | "document" | "other";

export function fileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/pdf" ||
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
