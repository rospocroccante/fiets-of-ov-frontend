import { renderHook, act } from "@testing-library/react";
import { useMorphProgress } from "./useMorphProgress";

// Mock window.scrollTo so jsdom does not throw
const mockScrollTo = vi.fn();
Object.defineProperty(window, "scrollTo", {
  value: mockScrollTo,
  writable: true,
});

// Mock window.matchMedia for jsdom (may be absent)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockReturnValue({ matches: false }),
});

beforeEach(() => {
  mockScrollTo.mockClear();
});

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
