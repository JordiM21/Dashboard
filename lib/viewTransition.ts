import { flushSync } from "react-dom";

/**
 * Runs a state update inside the browser's View Transition, so a task
 * moving columns or a lens switching glides instead of jumping. Browsers
 * without the API (and anyone asking for reduced motion) just get the
 * update.
 */
export function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
