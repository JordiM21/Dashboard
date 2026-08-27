"use client";

import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

// Excalidraw touches `window` at module scope, so it can only ever run in
// the browser — ssr:false keeps Next from trying to render it on the
// server, which would crash the build.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, { ssr: false });

export type { ExcalidrawImperativeAPI };

export default function ExcalidrawBoard({
  onApiReady,
  initialData,
  zenMode = false,
}: {
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
  initialData?: ExcalidrawInitialDataState;
  /** Hides Excalidraw's own chrome (menu, panels) for Screen Share mode — the gamification bar and mode toggle live outside this component. */
  zenMode?: boolean;
}) {
  return (
    // Excalidraw's own internal panels (library, stats, color picker) size
    // themselves relative to this containing block — position:relative +
    // overflow:hidden here is what keeps a library-internal sizing quirk
    // from escaping into a page-level (or even document-level) horizontal
    // scrollbar, on top of the same containment already applied by every
    // ancestor of this component.
    <div style={{ width: "100%", height: "100%", maxWidth: "100%", overflow: "hidden", position: "relative" }}>
      <Excalidraw
        excalidrawAPI={onApiReady}
        initialData={initialData}
        theme="light"
        zenModeEnabled={zenMode}
        UIOptions={{ canvasActions: { toggleTheme: true } }}
      />
    </div>
  );
}
