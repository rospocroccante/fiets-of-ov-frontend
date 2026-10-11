import { renderHook, act } from "@testing-library/react";
import { useMorphProgress } from "./useMorphProgress";

// Mock window.scrollTo so jsdom does not throw
const mockScrollTo = vi.fn();
Object.defineProperty(window, "scrollTo", {
  value: mockScrollTo,
  writable: true,
});

// Mock window.matchMedia for jsdom (may be absent). A MediaQueryList is an event
// target: the hook subscribes to its `change` event.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
});

beforeEach(() => {
  mockScrollTo.mockClear();
  mockScrollTo.mockImplementation(() => {});
});

afterEach(() => {
  parkScroll(0);
});

// The page's scroll position, which is what drives the morph outside reduced motion.
function parkScroll(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
}

function scrollPage(y: number) {
  parkScroll(y);
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

// The reduced-motion query as a MediaQueryList the test can flip, the way a rider
// flips the system setting while the app is open.
function reducedMotionSetting(initial: boolean): (reduce: boolean) => void {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", (query: string) => {
    expect(query).toBe("(prefers-reduced-motion: reduce)");
    return mql;
  });
  return (reduce) => {
    mql.matches = reduce;
    act(() => listeners.forEach((fn) => fn()));
  };
}

test("returns all required fields without throwing", () => {
  const { result } = renderHook(() => useMorphProgress());
  const { progress, containerRef, toMap, toHome, reduced } = result.current;
  expect(progress).toBeDefined();
  expect(containerRef).toBeDefined();
  expect(typeof toMap).toBe("function");
  expect(typeof toHome).toBe("function");
  expect(typeof reduced).toBe("boolean");
});

test("toMap calls window.scrollTo with behavior: smooth", () => {
  const { result } = renderHook(() => useMorphProgress());
  act(() => {
    result.current.toMap();
  });
  expect(mockScrollTo).toHaveBeenCalledWith(
    expect.objectContaining({ behavior: "smooth" })
  );
});

test("toHome calls window.scrollTo with top: 0", () => {
  const { result } = renderHook(() => useMorphProgress());
  act(() => {
    result.current.toHome();
  });
  expect(mockScrollTo).toHaveBeenCalledWith(
    expect.objectContaining({ top: 0 })
  );
});

test("does not throw when matchMedia is absent", () => {
  const original = window.matchMedia;
  // @ts-expect-error intentional deletion for test
  delete window.matchMedia;
  expect(() => renderHook(() => useMorphProgress())).not.toThrow();
  window.matchMedia = original;
});

test("reads the reduced-motion setting at mount", () => {
  reducedMotionSetting(true);
  const { result } = renderHook(() => useMorphProgress());
  expect(result.current.reduced).toBe(true);
});

test("follows a change to the reduced-motion setting made while the app is open", () => {
  const setReduced = reducedMotionSetting(false);
  const { result } = renderHook(() => useMorphProgress());
  expect(result.current.reduced).toBe(false);

  setReduced(true);
  expect(result.current.reduced).toBe(true);
  // Reduced from here on: toMap jumps instead of scrolling.
  act(() => result.current.toMap());
  expect(mockScrollTo).not.toHaveBeenCalled();
  expect(result.current.progress.get()).toBe(1);

  setReduced(false);
  expect(result.current.reduced).toBe(false);
});

test("once reduced motion is on, scrolling no longer drives the morph", () => {
  const setReduced = reducedMotionSetting(false);
  const { result } = renderHook(() => useMorphProgress());
  scrollPage(window.innerHeight);
  expect(result.current.progress.get()).toBe(1);

  setReduced(true);
  scrollPage(0);
  expect(result.current.progress.get()).toBe(1);
});

test("switching reduced motion on mid-morph settles on the closer stage", () => {
  const setReduced = reducedMotionSetting(false);
  const { result } = renderHook(() => useMorphProgress());
  scrollPage(Math.round(window.innerHeight * 0.3));
  expect(result.current.progress.get()).toBeCloseTo(0.3, 2);

  // Reduced motion has no scroll to finish the morph with, so a half-faded pose
  // would stay half-faded.
  setReduced(true);
  expect(result.current.progress.get()).toBe(0);
});

test("switching reduced motion off keeps a rider who is on the map on the map", () => {
  const setReduced = reducedMotionSetting(true);
  const { result } = renderHook(() => useMorphProgress());
  act(() => result.current.toMap());
  expect(result.current.progress.get()).toBe(1);

  // Back on the scroll-driven morph the page has to be where the map is, a viewport
  // down; read from the top it would put the rider back on the home.
  mockScrollTo.mockImplementation((opts: ScrollToOptions) => parkScroll(opts.top ?? 0));
  setReduced(false);
  expect(mockScrollTo).toHaveBeenCalledWith(
    expect.objectContaining({ top: window.innerHeight, behavior: "instant" }),
  );
  expect(result.current.progress.get()).toBe(1);
});
