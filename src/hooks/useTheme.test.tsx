import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
});

test("defaults to light, toggling flips the html class and persists", () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.dark).toBe(false);
  expect(document.documentElement.classList.contains("dark")).toBe(false);

  act(() => result.current.toggle());
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
