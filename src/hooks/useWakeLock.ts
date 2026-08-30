import { useEffect } from "react";

// Keeps the screen on while navigating. The browser auto-releases the sentinel when
// the tab is hidden, so it is re-acquired on visibilitychange. Everything is
// best-effort: an absent API (jsdom, older Safari, plain http) or a rejected request
// (battery saver, permissions policy) is a silent no-op — navigation works without it.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    // lib.dom types wakeLock as always present; at runtime it often is not.
    const wl = (navigator as { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return;

    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        const s = await wl.request("screen");
        if (disposed) {
          void s.release();
          return;
        }
        // Any previous sentinel was auto-released when the page hid; releasing it
        // again is a safe no-op and avoids leaking a still-held lock.
        if (sentinel) void sentinel.release();
        sentinel = s;
      } catch {
        // Not granted: keep navigating without the lock.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        void sentinel?.release();
      } catch {
        // Already released; nothing left to give back.
      }
      sentinel = null;
    };
  }, [active]);
}
