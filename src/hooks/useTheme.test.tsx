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
  expect(metas()).toEqual(["#ffffff", "#ffffff"]);

  act(() => result.current.toggle());
  expect(metas()).toEqual(["#0C1E32", "#0C1E32"]);

  act(() => result.current.toggle());
  expect(metas()).toEqual(["#ffffff", "#ffffff"]);
});
