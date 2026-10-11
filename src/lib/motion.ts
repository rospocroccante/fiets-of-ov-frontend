import type { TargetAndTransition } from "framer-motion";

// The app's motion, defined once: durations, curves, the list stagger and the framer
// presets for surfaces that arrive and leave. Anything that moves takes its timing
// from here, so the app keeps one tempo and a retune is one edit. The CSS side
// (Tailwind's `duration-fast/base/slow` and `ease-enter/exit`) is a copy in
// tailwind.config.js, because the config cannot import TypeScript; motion.test.tsx
// fails the moment the two disagree.
//
// Reduced motion is not handled per preset. MotionConfig reducedMotion="user" in
// main.tsx makes framer drop every transform (x, y, scale) when the user asks for less
// motion, so these presets fade in place, at their own durations; the global rule in
// index.css does the same job for CSS transitions and animations; Leaflet code asks
// prefersReducedMotion().

// Durations in ms, for CSS and Leaflet. `fast` is for exits and small state changes,
// `base` for things arriving, `slow` for larger surfaces, `reveal` for the theme
// switch's circle and `draw` for a route line drawing itself.
export const DURATION_MS = { fast: 150, base: 200, slow: 300, reveal: 450, draw: 600 } as const;

// The same durations in seconds, which is what framer's `transition.duration` takes.
export const DURATION = {
  fast: DURATION_MS.fast / 1000,
  base: DURATION_MS.base / 1000,
  slow: DURATION_MS.slow / 1000,
  reveal: DURATION_MS.reveal / 1000,
  draw: DURATION_MS.draw / 1000,
} as const;

// Two curves. `enter` is fast out of the gate and long to settle, so a surface is
// legible almost at once and still lands softly; `exit` starts slow and accelerates
// away, so a closing surface gets out of the way without a lingering tail.
export const EASE = {
  enter: [0.2, 0, 0, 1],
  exit: [0.3, 0, 1, 1],
} as const;

const cubicBezier = ([x1, y1, x2, y2]: readonly [number, number, number, number]) =>
  `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;

// The same curves as CSS timing functions, for style transitions set from code.
export const EASE_CSS = {
  enter: cubicBezier(EASE.enter),
  exit: cubicBezier(EASE.exit),
} as const;

// A list arrives one row after another, 40ms apart. Only the first six rows stagger;
// the rest arrive with the sixth, so a long list never makes anyone wait for its tail.
export const STAGGER = 0.04;
export const STAGGER_MAX = 6;

// The delay, in seconds, for the row at `index` in a staggered list.
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX - 1) * STAGGER;
}

// A preset is spread straight onto a motion element inside AnimatePresence:
// `<motion.div {...overlay}>`. Each state carries its own timing, so arriving and
// leaving can use different curves and durations without the caller passing any.
interface MotionPreset {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
}

const arrive = { duration: DURATION.base, ease: EASE.enter };
const leave = { duration: DURATION.fast, ease: EASE.exit };

// Cards and notices that float over the app: they rise 8px into place and drop 8px
// on the way out.
export const overlay = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: arrive },
  exit: { opacity: 0, y: 8, transition: leave },
} satisfies MotionPreset;

// Menus and suggestion lists hang from their trigger, so they grow from their top
// edge (originY 0) and drop 4px into place, and leave by lifting back 4px.
export const dropdown = {
  initial: { opacity: 0, scale: 0.98, y: -4, originY: 0 },
  animate: { opacity: 1, scale: 1, y: 0, originY: 0, transition: arrive },
  exit: { opacity: 0, y: -4, transition: leave },
} satisfies MotionPreset;

// The phone search sheet comes over the app from below. It keeps the 14px rise of the
// CSS keyframe the sheet uses today (fov-sheet-in, 180ms ease-out); `base` with the
// enter curve is the closest the shared tokens get to that feel.
export const sheet = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: arrive },
  exit: { opacity: 0, y: 14, transition: leave },
} satisfies MotionPreset;

// For code outside React (the Leaflet map), which cannot read MotionConfig. Call it at
// the moment of moving, so a change of the setting made after startup is honoured.
// Where matchMedia does not exist (jsdom) there is no setting to read, and the answer
// is the default: false.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
