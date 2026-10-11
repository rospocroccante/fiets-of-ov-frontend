import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  DURATION,
  DURATION_MS,
  EASE,
  EASE_CSS,
  STAGGER,
  STAGGER_MAX,
  dropdown,
  overlay,
  prefersReducedMotion,
  reducedPreset,
  sheet,
  staggerDelay,
  useMotionPreset,
} from "./motion";

// framer reads the system setting once per process and caches it, so stubbing
// matchMedia between tests cannot flip it. The hook's input is mocked instead; the
// rest of framer is the real thing.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: vi.fn(() => false),
}));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("staggerDelay", () => {
  test("steps 40ms per item, starting at zero", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(0.04, 10);
    expect(staggerDelay(2)).toBeCloseTo(0.08, 10);
    expect(staggerDelay(5)).toBeCloseTo(0.2, 10);
  });

  test("only the first six items stagger: the rest enter with the sixth", () => {
    const sixth = staggerDelay(STAGGER_MAX - 1);
    expect(sixth).toBeCloseTo((STAGGER_MAX - 1) * STAGGER, 10);
    expect(staggerDelay(STAGGER_MAX)).toBe(sixth);
    expect(staggerDelay(STAGGER_MAX + 1)).toBe(sixth);
    expect(staggerDelay(40)).toBe(sixth);
  });
});

describe("prefersReducedMotion", () => {
  test("is false where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  test("asks the reduce query and returns its answer", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));
    vi.stubGlobal("matchMedia", matchMedia);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  test("is false when the user has not asked for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("tokens", () => {
  // The agreed values, verbatim. Every enter, exit, stagger and draw in the app reads
  // them from here, so a retune is a deliberate edit of this test as well.
  test("durations, in ms and in the seconds framer takes", () => {
    expect(DURATION_MS).toEqual({ fast: 150, base: 200, slow: 300, reveal: 450, draw: 600 });
    expect(DURATION).toEqual({ fast: 0.15, base: 0.2, slow: 0.3, reveal: 0.45, draw: 0.6 });
  });

  test("easings, as framer bezier points and as CSS", () => {
    expect(EASE.enter).toEqual([0.2, 0, 0, 1]);
    expect(EASE.exit).toEqual([0.3, 0, 1, 1]);
    expect(EASE_CSS.enter).toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(EASE_CSS.exit).toBe("cubic-bezier(0.3, 0, 1, 1)");
  });

  test("stagger: 40ms per item, six items", () => {
    expect(STAGGER).toBe(0.04);
    expect(STAGGER_MAX).toBe(6);
  });

  // Tailwind cannot import a TypeScript module, so the CSS side of the tokens is a copy.
  // This is what keeps it one: `duration-base` and `ease-enter` must mean what
  // DURATION_MS.base and EASE_CSS.enter mean.
  test("the Tailwind transition tokens match", () => {
    const config = readFileSync(join(ROOT, "tailwind.config.js"), "utf8");
    const block = (name: string) => {
      const m = config.match(new RegExp(`${name}:\\s*\\{([^}]*)\\}`));
      if (!m) throw new Error(`no ${name} block in tailwind.config.js`);
      return Object.fromEntries([...m[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((e) => [e[1], e[2]]));
    };
    expect(block("transitionDuration")).toEqual({
      fast: `${DURATION_MS.fast}ms`,
      base: `${DURATION_MS.base}ms`,
      slow: `${DURATION_MS.slow}ms`,
    });
    expect(block("transitionTimingFunction")).toEqual({ enter: EASE_CSS.enter, exit: EASE_CSS.exit });
  });
});

describe("presets", () => {
  test("overlay: fades and rises 8px in over base, fades and drops 8px out over fast", () => {
    expect(overlay).toEqual({
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.enter } },
      exit: { opacity: 0, y: 8, transition: { duration: DURATION.fast, ease: EASE.exit } },
    });
  });

  test("dropdown: fades, grows from 0.98 and drops 4px from its top edge; leaves 4px up", () => {
    expect(dropdown).toEqual({
      initial: { opacity: 0, scale: 0.98, y: -4, originY: 0 },
      animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        originY: 0,
        transition: { duration: DURATION.base, ease: EASE.enter },
      },
      exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASE.exit } },
    });
  });

  test("sheet: fades and rises 14px in over base, fades and drops 14px out over fast", () => {
    expect(sheet).toEqual({
      initial: { opacity: 0, y: 14 },
      animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.enter } },
      exit: { opacity: 0, y: 14, transition: { duration: DURATION.fast, ease: EASE.exit } },
    });
  });

  // The presets are meant to be spread straight onto a motion element. This file is
  // type-checked with the rest of src, so the spread below is also the proof that
  // framer's props accept them as they are.
  test.each([
    ["overlay", overlay],
    ["dropdown", dropdown],
    ["sheet", sheet],
  ])("%s spreads onto a motion element and comes to rest fully shown", async (_, preset) => {
    render(<motion.div data-testid="m" {...preset} />);
    const el = screen.getByTestId("m");
    await waitFor(() => expect(el.style.opacity).toBe("1"));
    expect(el.style.transform).toBe("none");
  });

  test("the dropdown's transform origin is its top edge", async () => {
    render(<motion.div data-testid="m" {...dropdown} />);
    await waitFor(() => expect(screen.getByTestId("m").style.transformOrigin).toMatch(/^50% 0%/));
  });

  // setup.ts turns framer's animations off for the whole suite. Without that, every
  // test that closes an overlay would wait out its exit (150ms here, about 175ms
  // measured in jsdom) in real time, and a test asserting removal would pass or fail
  // on how fast the machine is. With it the element is gone in a few ms.
  test("an exiting element leaves at once under the test setup", async () => {
    const { rerender } = render(
      <AnimatePresence>{<motion.div key="m" data-testid="m" {...overlay} />}</AnimatePresence>,
    );
    // Let it arrive first: an element removed while still at its initial pose exits
    // from opacity 0 to opacity 0, which framer skips whatever the setup says.
    await waitFor(() => expect(screen.getByTestId("m").style.opacity).toBe("1"));
    const started = performance.now();
    rerender(<AnimatePresence>{null}</AnimatePresence>);
    await waitFor(() => expect(screen.queryByTestId("m")).toBeNull(), { timeout: 1000 });
    expect(performance.now() - started).toBeLessThan(DURATION_MS.fast);
  });
});

describe("reduced forms", () => {
  const presets = [
    ["overlay", overlay],
    ["dropdown", dropdown],
    ["sheet", sheet],
  ] as const;

  // Under reduced motion only an opacity fade of at most `fast` is allowed. framer's
  // MotionConfig already drops transforms but keeps each fade's own duration (base on
  // the way in), so the reduced form has to carry both rules itself.
  test.each(presets)("%s: opacity only, in every state", (_, preset) => {
    const reduced = reducedPreset(preset);
    for (const state of ["initial", "animate", "exit"] as const) {
      const keys = Object.keys(reduced[state]).filter((k) => k !== "transition");
      expect(keys, state).toEqual(["opacity"]);
      expect(reduced[state].opacity, state).toBe(preset[state].opacity);
    }
  });

  test.each(presets)("%s: every animated state lasts `fast`", (_, preset) => {
    const reduced = reducedPreset(preset);
    expect(reduced.animate.transition).toEqual({ duration: DURATION.fast, ease: EASE.enter });
    expect(reduced.exit.transition).toEqual({ duration: DURATION.fast, ease: EASE.exit });
  });

  test("a state without a transition of its own still gets `fast`, not framer's default", () => {
    const reduced = reducedPreset({
      initial: { opacity: 0, x: 10 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, scale: 0.9 },
    });
    expect(reduced.animate).toEqual({ opacity: 1, transition: { duration: DURATION.fast } });
    expect(reduced.exit).toEqual({ opacity: 0, transition: { duration: DURATION.fast } });
  });

  test("per-value transitions and transitionEnd lose their transforms too", () => {
    const reduced = reducedPreset({
      initial: { opacity: 0, y: 6 },
      animate: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, delay: 0.08, opacity: { duration: 0.5 }, y: { duration: 0.3 } },
        transitionEnd: { y: 0, scale: 1 },
      },
      exit: { opacity: 0 },
    });
    expect(reduced.animate).toEqual({
      opacity: 1,
      transition: { duration: DURATION.fast, delay: 0.08, opacity: { duration: DURATION.fast } },
      transitionEnd: {},
    });
  });

  test("the preset itself is left alone", () => {
    const before = JSON.stringify(overlay);
    reducedPreset(overlay);
    expect(JSON.stringify(overlay)).toBe(before);
  });
});

describe("useMotionPreset", () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  test("returns the preset unchanged when reduced motion is off", () => {
    const { result } = renderHook(() => useMotionPreset(overlay));
    expect(result.current).toBe(overlay);
  });

  test("returns the reduced form when reduced motion is on", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { result } = renderHook(() => useMotionPreset(dropdown));
    expect(result.current).toEqual(reducedPreset(dropdown));
  });

  test("hands back the same object across renders, so framer sees no new target", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { result, rerender } = renderHook(() => useMotionPreset(sheet));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  test("its result spreads onto a motion element", async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    function Probe() {
      return <motion.div data-testid="m" {...useMotionPreset(overlay)} />;
    }
    render(<Probe />);
    const el = screen.getByTestId("m");
    await waitFor(() => expect(el.style.opacity).toBe("1"));
    expect(el.style.transform).toBe("");
  });
});

describe("index.css", () => {
  // One rule stills the whole app's CSS motion under reduced motion. The spinner is
  // the one exception: it is a progress indicator, and a frozen one reads as "stuck".
  test("reduced motion makes every CSS transition and animation instant, except the spinner", () => {
    const css = readFileSync(join(ROOT, "src", "index.css"), "utf8");
    const rule = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*:not\(\.animate-spin\),\s*::before,\s*::after\s*\{([^}]*)\}/,
    );
    expect(rule, "the global reduced-motion rule").not.toBeNull();
    const body = rule![1];
    expect(body).toMatch(/animation-duration:\s*0\.01ms !important;/);
    expect(body).toMatch(/animation-iteration-count:\s*1 !important;/);
    expect(body).toMatch(/transition-duration:\s*0\.01ms !important;/);
    expect(body).toMatch(/scroll-behavior:\s*auto !important;/);
  });
});
