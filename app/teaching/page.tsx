"use client";

import dynamic from "next/dynamic";

// The entire Teaching view is client-only — Excalidraw touches `window` at
// module scope, so nothing that imports from "@excalidraw/excalidraw" (even
// indirectly) can survive Next's server render pass. ssr:false here is what
// actually guarantees that; see components/TeachingView.tsx's header
// comment for the SSR crash this fixed.
const TeachingView = dynamic(() => import("@/components/TeachingView"), {
  ssr: false,
  loading: () => (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Teaching</div>
          <div className="page-subtitle">Loading the whiteboard…</div>
        </div>
      </div>
    </main>
  ),
});

export default function TeachingPage() {
  return <TeachingView />;
}
