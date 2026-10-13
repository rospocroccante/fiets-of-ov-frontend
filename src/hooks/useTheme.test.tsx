import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { useTheme } from "./useTheme";

const realMatchMedia = window.matchMedia;

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark", "theme-switching");
  // jsdom has no view transitions; the tests that stub one take it away again.
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  window.matchMedia = realMatchMedia;
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

// A stand-in for the browser's view transition that holds the update callback until the
// test runs it, the way the browser holds it until the old page has been captured.
function stubViewTransition() {
  let update: (() => void) | null = null;
  let settle!: () => void;
  const finished = new Promise<void>((resolve) => (settle = resolve));
  const start = vi.fn((cb: () => void) => {
    update = cb;
    return { finished, ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} };
  });
  Object.assign(document, { startViewTransition: start });
  return { start, runUpdate: () => update?.(), settle };
}

function reduceMotion() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

test("defaults to light, toggling flips the html class and persists", () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.dark).toBe(false);
  expect(document.documentElement.classList.contains("dark")).toBe(false);

  // jsdom has no startViewTransition: the switch is instant, origin or not.
  act(() => result.current.toggle({ x: 10, y: 10 }));
  expect(result.current.dark).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(window.localStorage.getItem("fov.theme.v1")).toBe("dark");
});

test("a saved dark preference wins on mount", () => {
  window.localStorage.setItem("fov.theme.v1", "dark");
  const { result } = renderHook(() => useTheme());
  expect(result.current.dark).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("with view transitions, the new theme is in the DOM by the time the callback returns", async () => {
  const vt = stubViewTransition();
  const { result } = renderHook(() => useTheme());
  const root = document.documentElement;

  act(() => result.current.toggle({ x: 40, y: 60 }));
  expect(vt.start).toHaveBeenCalledTimes(1);
  // Nothing has changed before the browser runs the callback: the old page is what it
  // captures first.
  expect(root.classList.contains("dark")).toBe(false);
  expect(root.style.getPropertyValue("--reveal-x")).toBe("40px");
  expect(root.style.getPropertyValue("--reveal-y")).toBe("60px");

  act(() => {
    vt.runUpdate();
    // Straight after the callback, inside the same turn: this is the new snapshot.
    expect(root.classList.contains("dark")).toBe(true);
  });
  expect(result.current.dark).toBe(true);
  expect(window.localStorage.getItem("fov.theme.v1")).toBe("dark");

  // Colour transitions are held for as long as the circle runs, and no longer.
  expect(root.classList.contains("theme-switching")).toBe(true);
  await act(async () => {
    vt.settle();
    await Promise.resolve();
  });
  expect(root.classList.contains("theme-switching")).toBe(false);
});

test("reduced motion switches at once, without a view transition", () => {
  reduceMotion();
  const vt = stubViewTransition();
  const { result } = renderHook(() => useTheme());

  act(() => result.current.toggle({ x: 40, y: 60 }));
  expect(vt.start).not.toHaveBeenCalled();
  expect(result.current.dark).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("the browser chrome colour follows a manual toggle, not the system scheme", () => {
  document.head.insertAdjacentHTML(
    "beforeend",
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0C1E32">',
  );
  const metas = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content"));
  const { result } = renderHook(() => useTheme());
  // A first visit is System mode: each meta keeps its own scheme's colour, so the
  // browser chrome follows the system until a theme is chosen.
  expect(metas()).toEqual(["#ffffff", "#0C1E32"]);

  act(() => result.current.toggle());
  expect(metas()).toEqual(["#0C1E32", "#0C1E32"]);

  act(() => result.current.toggle());
  expect(metas()).toEqual(["#ffffff", "#ffffff"]);
});

function systemScheme(dark: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const mql = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    // A real MediaQueryList forgets a removed listener; the hook relies on that when it
    // leaves System mode.
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      const at = listeners.indexOf(fn);
      if (at !== -1) listeners.splice(at, 1);
    },
    addListener: () => {},
    removeListener: () => {},
  };
  const real = window.matchMedia;
  window.matchMedia = ((q: string) =>
    q.includes("prefers-color-scheme") ? mql : { ...mql, matches: false, media: q }) as unknown as typeof window.matchMedia;
  return {
    flip(next: boolean) {
      mql.matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
    restore() {
      window.matchMedia = real;
    },
  };
}

test("a first visit follows the system and stores nothing", () => {
  const sys = systemScheme(true);
  const { result } = renderHook(() => useTheme());
  expect(result.current.mode).toBe("system");
  expect(result.current.dark).toBe(true);
  expect(window.localStorage.getItem("fov.theme.v1")).toBeNull();
  sys.restore();
});

test("in System mode the app follows the OS switching while it is open", () => {
  const sys = systemScheme(false);
  const { result } = renderHook(() => useTheme());
  act(() => sys.flip(true));
  expect(result.current.dark).toBe(true);
  expect(document.documentElement).toHaveClass("dark");
  sys.restore();
});

test("an explicit choice ignores the OS and persists; System clears it", () => {
  const sys = systemScheme(false);
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setMode("light"));
  act(() => sys.flip(true));
  expect(result.current.dark).toBe(false);
  expect(window.localStorage.getItem("fov.theme.v1")).toBe("light");
  act(() => result.current.setMode("system"));
  expect(result.current.mode).toBe("system");
  expect(result.current.dark).toBe(true);
  expect(window.localStorage.getItem("fov.theme.v1")).toBeNull();
  sys.restore();
});

test("two taps before the circle's callback runs leave the theme and the stored choice in step", () => {
  // Unlike stubViewTransition, this keeps every callback: the browser runs a skipped
  // transition's update too, so both taps land.
  const updates: (() => void)[] = [];
  Object.assign(document, {
    startViewTransition: (cb: () => void) => {
      updates.push(cb);
      return { finished: new Promise(() => {}), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} };
    },
  });
  const { result } = renderHook(() => useTheme());
  act(() => result.current.toggle());
  act(() => result.current.toggle());
  act(() => updates.forEach((run) => run()));
  expect(result.current.dark).toBe(false);
  expect(result.current.mode).toBe("light");
  expect(window.localStorage.getItem("fov.theme.v1")).toBe("light");
});
