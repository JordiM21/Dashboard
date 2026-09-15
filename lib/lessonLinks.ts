/**
 * Everything the lesson sheet needs to render a saved link as something you
 * recognise at a glance — a YouTube thumbnail, the image itself, or an icon
 * plus the site it points at. Pure string work, no network calls beyond the
 * <img> the caller ends up rendering.
 */

export type LinkKind = "youtube" | "image" | "video" | "audio" | "pdf" | "html" | "doc" | "link";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const HTML_EXT = /\.html?(\?|#|$)/i;
const DOC_EXT = /\.(docx?|pptx?|xlsx?|md|txt|csv|excalidraw)(\?|#|$)/i;

/** Resource-picked links carry their file's own known category as `?category=` — the URL itself is an
    extensionless `/api/resources/files/{id}/content` redirect, so there's nothing in the URL string to sniff
    an extension from. A pasted URL never has this param, so it falls through to extension sniffing below. */
function categoryHint(url: string): LinkKind | null {
  try {
    const category = new URL(url, "https://x.invalid").searchParams.get("category");
    if (category === "image" || category === "video" || category === "pdf" || category === "html") return category;
    return null;
  } catch {
    return null;
  }
}

/** The 11-character video id of a YouTube watch/share/embed/shorts URL, or null for anything else. */
export function youtubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1] : null;
}

export function linkKind(url: string): LinkKind {
  if (youtubeId(url)) return "youtube";
  const hint = categoryHint(url);
  if (hint) return hint;
  if (IMAGE_EXT.test(url)) return "image";
  if (VIDEO_EXT.test(url)) return "video";
  if (AUDIO_EXT.test(url)) return "audio";
  if (PDF_EXT.test(url)) return "pdf";
  if (HTML_EXT.test(url)) return "html";
  if (DOC_EXT.test(url)) return "doc";
  return "link";
}

export const LINK_ICON: Record<LinkKind, string> = {
  youtube: "▶️",
  image: "🖼️",
  video: "🎬",
  audio: "🎧",
  pdf: "📕",
  html: "🌐",
  doc: "📄",
  link: "🔗",
};

/** A preview image for this link, or null when there's nothing to show without fetching the page itself. */
export function linkThumb(url: string): string | null {
  const yt = youtubeId(url);
  if (yt) return `https://img.youtube.com/vi/${yt}/mqdefault.jpg`;
  if (linkKind(url) === "image") return url;
  return null;
}

/** "youtube.com" for an external link, "/api/resources/…" paths collapse to "Resources" — what to show under a link's title. */
export function linkSource(url: string): string {
  if (url.startsWith("/api/resources/")) return "Resources library";
  if (url.startsWith("/")) return "This dashboard";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Path segments that name the route, not the thing — "youtube.com/watch",
// "drive.google.com/file", "…/index.html". Using one as a title produces a
// list of links all called "watch", so fall back to the hostname instead.
const GENERIC_SEGMENTS = new Set(["watch", "embed", "shorts", "live", "view", "file", "d", "edit", "index", "index.html", "share", "s", "p"]);

/** A sensible default title when you paste a URL and don't type one — the last meaningful path segment, else the hostname. */
export function guessLinkTitle(url: string): string {
  try {
    const u = new URL(url, "https://x.invalid");
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && !/^\d+$/.test(last) && !GENERIC_SEGMENTS.has(last.toLowerCase())) {
      return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
    }
    return linkSource(url);
  } catch {
    return url;
  }
}

/** Only http(s) and same-origin paths are storable — a saved link is rendered as an anchor, so `javascript:` and friends never get in. */
export function isStorableUrl(url: string): boolean {
  return /^(https?:\/\/|\/)/i.test(url.trim());
}
