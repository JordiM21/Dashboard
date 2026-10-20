"use client";

/** Customization primitives: icon picker, colour swatches, cover picker, all in one small popover. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ImageSquare, UploadSimple, Trash, Link as LinkIcon } from "@phosphor-icons/react";
import { resizeImageFile } from "@/lib/imageResize";
import { toast } from "@/lib/hub/fx";
import { ICONS, IconByName, Layer } from "./ui";

export const SWATCHES = ["#FF6B4A", "#FFB020", "#30C48D", "#2FC9A0", "#14B8C4", "#3AA0FF", "#5E5CE6", "#8F7CFF", "#B26BFF", "#E86FD8", "#FF5C9A", "#8C9AA8"];

/** Preset covers: soft two-tone gradients, stored as "gradient:N" so they cost nothing. */
const GRADIENTS = [
  "linear-gradient(135deg, #FFB199 0%, #FF6B4A 100%)",
  "linear-gradient(135deg, #A1C4FD 0%, #3AA0FF 100%)",
  "linear-gradient(135deg, #C2FFD8 0%, #2FC9A0 100%)",
  "linear-gradient(135deg, #E0C3FC 0%, #8F7CFF 100%)",
  "linear-gradient(135deg, #FFD3E1 0%, #FF5C9A 100%)",
  "linear-gradient(135deg, #FDF6B2 0%, #FFB020 100%)",
  "linear-gradient(135deg, #2B2B3A 0%, #5E5CE6 100%)",
  "linear-gradient(135deg, #E9E9EF 0%, #8C9AA8 100%)",
  "radial-gradient(circle at 20% 20%, #C8F53C 0%, #2FC9A0 45%, #14B8C4 100%)",
  "radial-gradient(circle at 80% 0%, #FFD35C 0%, #FF7A1A 50%, #B26BFF 100%)",
];

export function coverCss(cover?: string): string | undefined {
  if (!cover) return undefined;
  if (cover.startsWith("gradient:")) return GRADIENTS[Number(cover.slice(9))] ?? GRADIENTS[0];
  return `center / cover no-repeat url(${JSON.stringify(cover)})`;
}

/** Downscales an upload to ≤1200px JPEG and returns it as a data: URL (ponytail: stored inline in the record (Firestore 1 MB/doc), move to Firebase Storage if covers get heavy). */
async function fileToCover(file: File): Promise<string> {
  const small = await resizeImageFile(file, 1200, 0.8);
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(small);
  });
}

/* ---------------------------------------------------------------- popover */

export function Popover({ anchor, open, onClose, children, width = 320 }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    // Measure again once the panel has mounted — its real height decides above vs below.
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 300;
      const below = r.bottom + 8;
      const y = below + h > innerHeight - 8 && r.top - h - 8 > 8 ? r.top - h - 8 : Math.min(below, innerHeight - h - 8);
      setPos({ x: Math.max(8, Math.min(r.left, innerWidth - width - 8)), y: Math.max(8, y) });
    };
    place();
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, anchor, width]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open, anchor, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <Layer open={open}>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            className="menu popover"
            role="dialog"
            style={{ left: pos.x, top: pos.y, width }}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Layer>,
    document.body
  );
}

/* ---------------------------------------------------------------- icon + colour */

export function IconPicker({ icon, color, onIcon, onColor, size = 40, label = "Change icon" }: { icon?: string; color?: string; onIcon: (v: string) => void; onColor?: (v: string) => void; size?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState("");
  const names = Object.keys(ICONS).filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <button ref={btn} className="folder-icon icon-pick" style={{ width: size, height: size, borderRadius: size * 0.3, "--c": color } as CSSProperties} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        <IconByName name={icon ?? "Folder"} size={size * 0.5} weight="duotone" />
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)}>
        {onColor && (
          <>
            <div className="label" style={{ padding: "6px 6px 8px" }}>Colour</div>
            <div className="row" style={{ flexWrap: "wrap", gap: 6, padding: "0 6px 10px" }}>
              {SWATCHES.map((c) => (
                <button key={c} className="swatch" aria-label={c} aria-pressed={c.toLowerCase() === color?.toLowerCase()} style={{ background: c }} onClick={() => onColor(c)} />
              ))}
              <label className="swatch swatch-custom" title="Custom colour">
                <input type="color" value={color ?? "#5E5CE6"} onChange={(e) => onColor(e.target.value.toUpperCase())} aria-label="Custom colour" />
              </label>
            </div>
          </>
        )}
        <div className="row" style={{ padding: "0 6px 6px" }}>
          <span className="label grow">Icon</span>
          <input className="input" style={{ height: 26, width: 130, fontSize: 12 }} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="icon-grid">
          {names.map((n) => (
            <button key={n} className="icon-btn" aria-pressed={n === icon} title={n} onClick={() => (onIcon(n), setOpen(false))} style={n === icon ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}>
              <IconByName name={n} size={18} />
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/* ---------------------------------------------------------------- cover */

export function CoverPicker({ value, onChange, height = 160, compact }: { value?: string; onChange: (v: string | undefined) => void; height?: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const upload = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("That isn’t an image", { tone: "danger" });
    try {
      onChange(await fileToCover(f));
      setOpen(false);
    } catch {
      toast("Couldn’t read that image", { tone: "danger" });
    }
  };
  const panel = (
    <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} width={340}>
      <div className="label" style={{ padding: "6px 6px 8px" }}>Cover</div>
      <div className="cover-grid">
        {GRADIENTS.map((g, i) => (
          <button key={i} aria-label={`Gradient ${i + 1}`} style={{ background: g }} onClick={() => (onChange(`gradient:${i}`), setOpen(false))} />
        ))}
      </div>
      <form
        className="row"
        style={{ padding: "10px 6px 6px" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) (onChange(url.trim()), setUrl(""), setOpen(false));
        }}
      >
        <LinkIcon size={16} className="faint" />
        <input className="input" style={{ height: 30 }} placeholder="Paste an image link" value={url} onChange={(e) => setUrl(e.target.value)} />
      </form>
      <div className="row" style={{ padding: "4px 6px 6px" }}>
        <button className="btn btn-sm grow" onClick={() => file.current?.click()}>
          <UploadSimple size={14} /> Upload image
        </button>
        {value && (
          <button className="btn btn-sm btn-danger" onClick={() => (onChange(undefined), setOpen(false))}>
            <Trash size={14} /> Remove
          </button>
        )}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </Popover>
  );

  if (!value || compact)
    return (
      <>
        <button ref={btn} className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}>
          <ImageSquare size={14} /> {compact ? (value ? "Change" : "Add photo") : "Add cover"}
        </button>
        {panel}
      </>
    );
  return (
    <div
      className="cover"
      style={{ height, background: coverCss(value) }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        upload(e.dataTransfer.files[0]);
      }}
    >
      <button ref={btn} className="cover-btn" onClick={() => setOpen(!open)}>
        <ImageSquare size={14} /> Change cover
      </button>
      {panel}
    </div>
  );
}
