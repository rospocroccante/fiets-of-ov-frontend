import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useConfirmTap } from "./useConfirmTap";

test("the first tap arms, the second within the window runs the action", () => {
  const action = vi.fn();
  const { result } = renderHook(() => useConfirmTap(action));
  act(() => result.current.tap());
  expect(result.current.armed).toBe(true);
  expect(action).not.toHaveBeenCalled();
  act(() => result.current.tap());
  expect(action).toHaveBeenCalledTimes(1);
  expect(result.current.armed).toBe(false);
});

test("an armed button disarms by itself", () => {
  vi.useFakeTimers();
  const action = vi.fn();
  const { result } = renderHook(() => useConfirmTap(action, 4000));
  act(() => result.current.tap());
  act(() => vi.advanceTimersByTime(4000));
  expect(result.current.armed).toBe(false);
  act(() => result.current.tap());
  expect(action).not.toHaveBeenCalled();
  vi.useRealTimers();
});
