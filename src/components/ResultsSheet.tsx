import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { useI18n } from "../lib/i18n";
import { SPRING } from "../lib/motion";
import {
  cycleDetent,
  detentHeights,
  hugs,
  nextDetent,
  rubberBand,
  snapDetent,
  type Detent,
  type DetentHeights,
} from "../lib/sheetDetents";

// The phone's results, over a full-screen map: a sheet with a header and the content under
// it. Collapsed (peek), the header is all it shows: the handle and the summary of the
// trip, measured, so the screen's edge never cuts through a slice of the content. Half
// and full show the content as well. The parent decides the detent; this component moves
// to it, and turns a drag or a tap into a request for a new one.
//
// The sheet hugs. When the header and the content fit under half there is one resting
// height, exactly that tall (sheetDetents.ts), no handle, and a drag only stretches it.
// A plan loading or a plan that failed has no content, so its sheet is the header alone.
//
// Touch goes through native listeners, not framer's drag, because of the hand-off: at full
// height the content scrolls, and the sheet only takes the gesture back when the content
// is at its top and the finger moves down. That decision has to be made on the first
// touchmove, while it can still be cancelled, which needs a non-passive listener. Below
// full the content does not scroll and every drag moves the sheet.
//
// A release keeps the finger's speed: the sheet settles on SPRING.sheet, started at the
// velocity the drag ended with. Reduced motion jumps instead. Every settle, whichever
// path started it, reports the settled height (onSettle) once it ends, so the map refits
// once per move and never per frame.
//
// The sheet slides with a transform inside its parent, which clips it.

// Below its tallest detent the sheet carries this much more of its own surface, so a fast
// flick that overshoots, or a drag stretched past the top, shows sheet under it and not
// a strip of map.
const OVERRUN_PX = 96;
// Rising from its peek, the content fades in over this many pixels.
const REVEAL_PX = 24;

interface Layout {
  heights: DetentHeights;
  frame: number;
}

// Up to the next whole pixel, from a measurement in Chrome's layout unit, 1/64px. A box
// read while the sheet's top is fractional (a plan landing mid-morph) carries float
// noise: the header's two edges subtracted to 165.00003 for a 165px header, and rounding
// that straight up made a 166px peek with a 1px strip of sheet under the header.
function ceilPx(v: number): number {
  return Math.ceil(Math.round(v * 64) / 64);
}

// The height of a box, rounded up. offsetHeight rounds a fractional box to the nearest
// pixel, and a peek half a pixel short of the header would leave the header's last half
// pixel under the screen's edge.
function boxHeight(el: Element | null): number {
  if (!(el instanceof HTMLElement)) return 0;
  return Math.max(el.offsetHeight, ceilPx(el.getBoundingClientRect().height));
}

function settle(
  visible: MotionValue<number>,
  target: number,
  velocity: number,
  reduce: boolean,
  done: () => void,
): AnimationPlaybackControls {
  // framer calls onComplete after a 0-duration animation as well, so the reduced path
  // reports through the same callback.
  return reduce
    ? animate(visible, target, { duration: 0, onComplete: done })
    : animate(visible, target, { ...SPRING.sheet, velocity, onComplete: done });
}

export function ResultsSheet({
  detent,
  onDetent,
  onSettle,
  header,
  children,
}: {
  detent: Detent;
  onDetent: (d: Detent) => void;
  onSettle?: (visiblePx: number) => void;
  // The summary: what the collapsed sheet shows.
  header: ReactNode;
  // The content under it, or nothing for a header-only sheet.
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const heights = layout?.heights ?? null;
  const single = heights ? hugs(heights) : false;
  const visible = useMotionValue(0);
  const frame = layout?.frame ?? 0;
  const y = useTransform(visible, (v) => frame - v);
  // Collapsed, the content is there (it does not remount on every move) but nothing of it
  // shows: it is transparent and hidden at the peek, and fades in as the sheet rises.
  const reveal = useTransform(visible, (v) =>
    !heights || single ? 1 : Math.min(1, Math.max(0, (v - heights.peek) / REVEAL_PX)),
  );
  const contentVisibility = useTransform(reveal, (r) => (r > 0 ? "visible" : "hidden"));
  const anim = useRef<AnimationPlaybackControls | null>(null);
  // The speed a drag let go at, for the settle its release asks the parent for.
  const release = useRef<number | null>(null);
  // The click a drag's own release makes on the handle is not a tap. A mouse released on
  // the handle makes one, and so can a touch that moved only a little, which the browser
  // still counts as a tap. A touch dragged further makes none (measured in Chrome), so
  // this flag cannot wait for that click to lower it: it stayed up and swallowed the next
  // real tap. It lives for one gesture instead, raised when a drag ends and lowered when
  // the next press or key press begins. No click can belong to a drag once another
  // gesture has started, so this needs no guess at how soon a browser delivers a click,
  // which a time window after the drag would.
  const suppressClick = useRef(false);
  const live = useRef({ detent, heights, single, onDetent, onSettle, reduce });
  live.current = { detent, heights, single, onDetent, onSettle, reduce };

  useLayoutEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;
    const read = () => {
      const head = headRef.current;
      const content = contentRef.current;
      // The header runs from the sheet's top edge, its border included, to the foot of
      // the summary.
      const top = root.getBoundingClientRect().top;
      const header = Math.max(boxHeight(head), head ? ceilPx(head.getBoundingClientRect().bottom - top) : 0);
      const body = boxHeight(bodyRef.current);
      let padding = 0;
      if (body > 0 && content) {
        const cs = getComputedStyle(content);
        padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      }
      const box = Math.round(boxHeight(parent));
      const next = detentHeights({
        container: box,
        viewport: window.innerHeight,
        safeBottom: probeRef.current?.offsetHeight ?? 0,
        header,
        content: body > 0 ? body + padding : 0,
      });
      setLayout((prev) =>
        prev &&
        prev.frame === box &&
        prev.heights.peek === next.peek &&
        prev.heights.half === next.half &&
        prev.heights.full === next.full
          ? prev
          : { heights: next, frame: box },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    for (const el of [parent, headRef.current, bodyRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const placed = useRef(false);
  useEffect(() => {
    if (!heights) return;
    const target = heights[detent];
    const velocity = release.current ?? (visible.isAnimating() ? visible.getVelocity() : 0);
    release.current = null;
    anim.current?.stop();
    if (reduce || !placed.current) {
      placed.current = true;
      visible.set(target);
      live.current.onSettle?.(target);
      return;
    }
    anim.current = settle(visible, target, velocity, false, () => live.current.onSettle?.(target));
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
      const { heights: h, detent: current, single: alone, reduce: still } = live.current;
      if (!taking || !h) return;
      suppressClick.current = true;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      const growth = dt > 0 ? (a.y - b.y) / dt : 0;
      // A sheet with one height only ever stretches: it goes back where it was.
      const next = alone ? current : snapDetent(visible.get(), growth, h);
      if (next !== current) {
        if (typeof navigator.vibrate === "function") navigator.vibrate(8);
        release.current = growth;
        live.current.onDetent(next);
      } else {
        // Back to the detent it left, which is a settle like any other and reports when it
        // ends. The drag may have stopped a settle animation before that one reported, and
        // then nothing else would: the parent kept the previous detent's height.
        const target = h[next];
        anim.current?.stop();
        anim.current = settle(visible, target, growth, still, () => live.current.onSettle?.(target));
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
    // A mouse drags by the header and the handle (a desktop window narrow enough for this
    // layout).
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
  // Collapsed, the content is out of reach as well as out of sight. A sheet with one
  // height has no collapsed state: all of it is always live.
  const veiled = detent === "peek" && !single;
  const full = heights?.full ?? 0;
  return (
    <motion.section
      ref={rootRef}
      data-fov="results-sheet"
      data-detent={detent}
      data-hugs={single ? "" : undefined}
      aria-label={t("resultsSheetLabel")}
      className="absolute inset-x-0 top-0 z-[1100] flex flex-col rounded-t-[20px] border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)] dark:border-night-rim/30 dark:bg-night-surface"
      style={{
        height: heights ? full + OVERRUN_PX : "100%",
        paddingBottom: heights ? OVERRUN_PX : 0,
        y,
        visibility: heights ? "visible" : "hidden",
      }}
    >
      <div ref={probeRef} aria-hidden="true" className="pointer-events-none absolute h-[env(safe-area-inset-bottom)] w-0" />
      {/* The header: the handle and the summary. A tap on it, away from its own buttons,
          is a tap on the handle, so the whole collapsed sheet opens it. A mouse can drag
          the sheet from anywhere in it. */}
      <div
        ref={headRef}
        data-fov="sheet-head"
        data-sheet-grip=""
        className="shrink-0 touch-none"
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest("button, a, input, select, textarea")) return;
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (!single) onDetent(cycleDetent(detent));
        }}
      >
        {single ? (
          // Nothing to expand or collapse, so no handle: the space it took above the
          // summary, less what a grabber needs.
          <div aria-hidden="true" className="h-3" />
        ) : (
          <button
            type="button"
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
            className="flex min-h-[44px] w-full items-center justify-center rounded-t-[20px]"
          >
            <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-night-border" />
          </button>
        )}
        <div data-fov="sheet-header">{header}</div>
      </div>
      <motion.div
        ref={contentRef}
        data-fov="sheet-content"
        inert={veiled ? "" : undefined}
        aria-hidden={veiled ? true : undefined}
        className="min-h-0 flex-1 overscroll-contain px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{
          opacity: reveal,
          visibility: contentVisibility,
          overflowY: atFull ? "auto" : "hidden",
          touchAction: atFull ? "pan-y" : "none",
        }}
      >
        <div ref={bodyRef} data-fov="sheet-body">
          {children}
        </div>
      </motion.div>
    </motion.section>
  );
}
