"use client";

import dynamic from "next/dynamic";

// The entire Teaching view is client-only — Excalidraw touches `window` at
// module scope, so nothing that imports from "@excalidraw/excalidraw" (even
// indirectly) can survive Next's server render pass. ssr:false here is what
// actually guarantees that; see components/TeachingView.tsx's header
// comment for the SSR crash this fixed.
// Pulse-skeleton stand-in for the real layout (header, tab switcher, sidebar
// cards, canvas) — shown while this route's JS chunk downloads/compiles.
// Excalidraw drags in a genuinely huge dependency graph (mermaid, cytoscape,
// d3, rough.js…), so this chunk is by far the heaviest in the app; the
// skeleton is what keeps that wait from reading as the navbar being broken.
// FloatingNav also starts fetching this same chunk on hover/focus of the
// "Teaching" tab, so by the time this fallback would show, the download is
// often already underway.
function TeachingSkeleton() {
  return (
    <main className="page" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 112px)", padding: "16px 24px", overflow: "hidden" }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div style={{ width: "100%" }}>
          <div className="skeleton" style={{ height: 26, width: 140, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: 280 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="skeleton" style={{ height: 36, width: 110 }} />
          <div className="skeleton" style={{ height: 36, width: 80 }} />
          <div className="skeleton" style={{ height: 36, width: 170 }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 34, width: 260, marginBottom: 12, flexShrink: 0 }} />
      <div style={{ display: "flex", flex: 1, gap: 14, minHeight: 0 }}>
        <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 62 }} />
          ))}
        </div>
        <div className="skeleton" style={{ flex: 1 }} />
      </div>
    </main>
  );
}

const TeachingView = dynamic(() => import("@/components/TeachingView"), {
  ssr: false,
  loading: TeachingSkeleton,
});

export default function TeachingPage() {
  return <TeachingView />;
}
