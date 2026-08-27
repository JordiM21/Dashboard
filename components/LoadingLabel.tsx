import type { ReactNode } from "react";
import Spinner from "@/components/Spinner";

/**
 * Drop-in replacement for `{loading ? "Saving…" : "Save"}`-style button
 * labels — the resting label stays mounted (just invisible) instead of
 * being swapped for shorter/longer loading text, so the button never
 * resizes or nudges its neighbors while an action is in flight. A spinner
 * overlays in its place. Parent needs `position: relative` (the app's base
 * `.btn` class already has it) for the overlay to center correctly.
 */
export default function LoadingLabel({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <>
      <span style={{ visibility: loading ? "hidden" : "visible" }}>{children}</span>
      {loading && <Spinner style={{ position: "absolute", inset: 0, margin: "auto" }} />}
    </>
  );
}
