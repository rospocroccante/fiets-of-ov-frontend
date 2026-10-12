import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "framer-motion";
import { useI18n } from "../lib/i18n";
import { DURATION, EASE } from "../lib/motion";
import {
  cycleDetent,
  detentHeights,
  nextDetent,
  rubberBand,
  snapDetent,
  type Detent,
  type DetentHeights,
} from "../lib/sheetDetents";

// The phone's results, over a full-screen map: a sheet with three resting heights
// (sheetDetents.ts). The parent decides the detent; this component moves to it, and turns
// a drag into a request for a new one.
//
// Touch goes through native listeners, not framer's drag, because of the hand-off: at full
// height the content scrolls, and the sheet only takes the gesture back when the content
// is at its top and the finger moves down. That decision has to be made on the first
// touchmove, while it can still be cancelled, which needs a non-passive listener. Below
// full the content does not scroll and every drag moves the sheet.
//
// The sheet is the parent's full height and slides with a transform; the parent clips it.
// Only the settled height is reported (onSettle), so the map refits once per move, not
// once per frame.
export function ResultsSheet({
  detent,
  onDetent,
  onSettle,
  children,
}: {
  detent: Detent;
  onDetent: (d: Detent) => void;
  onSettle?: (visiblePx: number) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<DetentHeights | null>(null);
  const visible = useMotionValue(0);
  const full = heights?.full ?? 0;
  const y = useTransform(visible, (v) => full - v);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  // The click a drag's own release makes on the handle is not a tap. A mouse released on
  // the handle makes one, and so can a touch that moved only a little, which the browser
  // still counts as a tap. A touch dragged further makes none (measured in Chrome), so
  // this flag cannot wait for that click to lower it: it stayed up and swallowed the next
  // real tap. It lives for one gesture instead, raised when a drag ends and lowered when
  // the next press or key press begins. No click can belong to a drag once another
  // gesture has started, so this needs no guess at how soon a browser delivers a click,
  // which a time window after the drag would.
  const suppressClick = useRef(false);
  const live = useRef({ detent, heights, onDetent, onSettle, reduce });
  live.current = { detent, heights, onDetent, onSettle, reduce };

  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const read = () => {
      const next = detentHeights(parent.clientHeight, window.innerHeight, probeRef.current?.offsetHeight ?? 0);
      setHeights((prev) =>
        prev && prev.peek === next.peek && prev.half === next.half && prev.full === next.full ? prev : next,
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const placed = useRef(false);
  useEffect(() => {
    if (!heights) return;
    const target = heights[detent];
    anim.current?.stop();
    if (reduce || !placed.current) {
      placed.current = true;
      visible.set(target);
      live.current.onSettle?.(target);
      return;
    }
    anim.current = animate(visible, target, {
      duration: DURATION.slow,
      ease: EASE.enter,
      onComplete: () => live.current.onSettle?.(target),
    });
  }, [detent, heights, reduce, visible]);

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    let active = false;
    let taking: boolean | null = null;
    let startY = 0;
    let startVisible = 0;
    let samples: { y: number; t: number }[] = [];

    const begin = (clientY: number) => {
      suppressClick.current = false;
      active = true;
      taking = null;
      startY = clientY;
      startVisible = visible.get();
      samples = [{ y: clientY, t: performance.now() }];
    };
    const drag = (clientY: number) => {
      const h = live.current.heights;
      if (!h) return;
      visible.set(rubberBand(startVisible + (startY - clientY), h.peek, h.full));
      samples.push({ y: clientY, t: performance.now() });
      if (samples.length > 5) samples.shift();
    };
    const finish = () => {
      if (!active) return;
      active = false;
      const h = live.current.heights;
      if (!taking || !h) return;
      suppressClick.current = true;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      const growth = dt > 0 ? (a.y - b.y) / dt : 0;
      const next = snapDetent(visible.get(), growth, h);
      if (next !== live.current.detent) {
        if (typeof navigator.vibrate === "function") navigator.vibrate(8);
        live.current.onDetent(next);
      } else {
        anim.current?.stop();
        anim.current = animate(visible, h[next], {
          duration: live.current.reduce ? 0 : DURATION.slow,
          ease: EASE.enter,
        });
      }
    };
    // The content keeps a gesture only at full height, and only if it can scroll that way.
    const contentKeeps = (target: EventTarget | null, dy: number) => {
      if (!(target instanceof Node) || !content.contains(target)) return false;
      if (live.current.detent !== "full") return false;
      return content.scrollTop > 0 || dy < 0;
    };
    // Whether the browser can be scrolling under this touch: only in the content at full
    // height. Everywhere else in the sheet is `touch-action: none`, and Chrome sends the
    // moves of such a touch with cancelable false, because there is no scroll for them to
    // stop. Measured on the handle: every move uncancellable, so a rule of "take only what
    // can be cancelled" left the handle unable to drag the sheet at all.
    const mayScroll = (target: EventTarget | null) =>
      target instanceof Node && content.contains(target) && live.current.detent === "full";

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) begin(e.touches[0].clientY);
      else active = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      const clientY = e.touches[0].clientY;
      if (taking === null) {
        const dy = clientY - startY;
        if (Math.abs(dy) < 4) return;
        taking = (e.cancelable || !mayScroll(e.target)) && !contentKeeps(e.target, dy);
        if (taking) anim.current?.stop();
      }
      if (!taking) return;
      if (e.cancelable) e.preventDefault();
      drag(clientY);
    };
    const onTouchEnd = () => finish();
    // A mouse drags by the handle only (a desktop window narrow enough for this layout).
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !(e.target instanceof Element) || !e.target.closest("[data-sheet-grip]")) return;
      begin(e.clientY);
      const move = (ev: PointerEvent) => {
        if (taking === null) {
          if (Math.abs(ev.clientY - startY) < 4) return;
          taking = true;
          anim.current?.stop();
        }
        drag(ev.clientY);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        finish();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    root.addEventListener("pointerdown", onPointerDown);
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      root.removeEventListener("pointerdown", onPointerDown);
    };
  }, [visible]);

  const atFull = detent === "full";
  return (
    <motion.section
      ref={rootRef}
      data-fov="results-sheet"
      data-detent={detent}
      aria-label={t("resultsSheetLabel")}
      className="absolute inset-x-0 top-0 z-[1100] flex flex-col rounded-t-[20px] border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)] dark:border-night-rim/30 dark:bg-night-surface"
      style={{ height: full || "100%", y, visibility: heights ? "visible" : "hidden" }}
    >
      <div ref={probeRef} aria-hidden="true" className="pointer-events-none absolute h-[env(safe-area-inset-bottom)] w-0" />
      <button
        type="button"
        data-sheet-grip=""
        data-fov="sheet-handle"
        aria-label={atFull ? t("collapseResults") : t("expandResults")}
        aria-expanded={atFull}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onDetent(cycleDetent(detent));
        }}
        onKeyDown={(e) => {
          suppressClick.current = false;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onDetent(nextDetent(detent, 1));
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onDetent(nextDetent(detent, -1));
          }
        }}
        className="flex min-h-[44px] w-full shrink-0 touch-none items-center justify-center rounded-t-[20px]"
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-night-border" />
      </button>
      <div
        ref={contentRef}
        data-fov="sheet-content"
        className="min-h-0 flex-1 overscroll-contain px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ overflowY: atFull ? "auto" : "hidden", touchAction: atFull ? "pan-y" : "none" }}
      >
        {children}
      </div>
    </motion.section>
  );
}
