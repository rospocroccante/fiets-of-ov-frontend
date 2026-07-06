import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

test("uses the fallback when matchMedia is unavailable", () => {
  // jsdom does provide matchMedia (always non-matching), so simulate its absence.
  vi.stubGlobal("matchMedia", undefined);
  const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)", true));
  expect(result.current).toBe(true);
});

test("tracks matchMedia changes", () => {
  let listener: (() => void) | null = null;
  const mql = {
    matches: false,
    addEventListener: (_: string, fn: () => void) => {
      listener = fn;
    },
    removeEventListener: () => {},
  };
  vi.stubGlobal("matchMedia", () => mql);

  const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
  expect(result.current).toBe(false);

  mql.matches = true;
  act(() => listener?.());
  expect(result.current).toBe(true);
});
