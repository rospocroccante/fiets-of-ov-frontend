import { useMemo } from "react";
import { transformProps, useReducedMotion, type TargetAndTransition } from "framer-motion";

// The app's motion, defined once: durations, curves, the list stagger and the framer
// presets for surfaces that arrive and leave. Anything that moves takes its timing
// from here, so the app keeps one tempo and a retune is one edit. The CSS side
// (Tailwind's `duration-fast/base/slow` and `ease-enter/exit`) is a copy in
// tailwind.config.js, because the config cannot import TypeScript; motion.test.tsx
// fails the moment the two disagree.
//
// Reduced motion allows an opacity fade of at most `fast` and nothing that moves.
// MotionConfig reducedMotion="user" in main.tsx makes framer drop every transform, but
// it keeps each fade's own duration (`base` on the way in), so components spread
// useMotionPreset(preset), which hands them the reduced form of the preset when the
// user asks for less motion. The global rule in index.css covers CSS transitions and
// animations; Leaflet code asks prefersReducedMotion().

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
export interface MotionPreset {
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

type Values = Record<string, unknown>;

// x, y, scale and every other key framer composes into `transform`, plus the origin,
// which only means something to a transform.
const isTransformKey = (key: string) =>
  transformProps.has(key) || key === "transform" || key === "originX" || key === "originY" || key === "originZ";

const isPlainObject = (v: unknown): v is Values =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function withoutTransforms(values: Values): Values {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !isTransformKey(key)));
}

// The same transition at `fast`. Curves and delays stay; a per-value override (an
// object under a value's name) is shortened as well, or dropped with its transform.
function atFast(transition: Values): Values {
  const out: Values = { duration: DURATION.fast };
  for (const [key, value] of Object.entries(transition)) {
    if (key === "duration" || isTransformKey(key)) continue;
    out[key] = isPlainObject(value) ? { ...value, duration: DURATION.fast } : value;
  }
  return out;
}

function reduceState(target: TargetAndTransition, animated: boolean): TargetAndTransition {
  const { transition, transitionEnd, ...values } = target;
  const out = withoutTransforms(values);
  // An animated state always gets a transition: with none, framer would fall back to
  // its default tween, which is longer than `fast`.
  if (animated || transition) out.transition = atFast((transition ?? {}) as Values);
  if (transitionEnd) out.transitionEnd = withoutTransforms(transitionEnd as Values);
  return out as TargetAndTransition;
}

// The reduced-motion form of a preset: the same opacity keyframes, no transform in any
// state, every transition at `fast`. Pure, so the preset it is given is left as it was.
export function reducedPreset(preset: MotionPreset): MotionPreset {
  return {
    initial: reduceState(preset.initial, false),
    animate: reduceState(preset.animate, true),
    exit: reduceState(preset.exit, true),
  };
}

// What a component spreads: `<motion.div {...useMotionPreset(overlay)}>`. The preset
// as it is, or its reduced form when the user asks for less motion. framer reads the
// setting when the component mounts, which is when an overlay opens, so a change of
// the setting reaches the next overlay rather than one already on screen. Memoised, so
// a re-render hands framer the same targets and starts nothing.
export function useMotionPreset(preset: MotionPreset): MotionPreset {
  const reduce = useReducedMotion();
  return useMemo(() => (reduce ? reducedPreset(preset) : preset), [reduce, preset]);
}
