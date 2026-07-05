import { act, renderHook } from "@testing-library/react";
import { useWakeLock } from "./useWakeLock";

// jsdom has no navigator.wakeLock; each test installs its own stub (configurable so
// it can be deleted again) and afterEach removes it so nothing leaks across files.
function stubWakeLock() {
  const release = vi.fn();
  const request = vi.fn(async (_type: string) => ({ release }));
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
  });
  return { request, release };
}

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

test("active: requests a screen wake lock once and releases it on unmount", async () => {
  const { request, release } = stubWakeLock();
  const { unmount } = renderHook(() => useWakeLock(true));
  // Let the request promise settle so the sentinel is actually held.
  await act(async () => {});
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("screen");
  expect(release).not.toHaveBeenCalled();

  unmount();
  expect(release).toHaveBeenCalledTimes(1);
});

test("inactive: never requests", async () => {
  const { request } = stubWakeLock();
  renderHook(() => useWakeLock(false));
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
});

test("re-acquires when the document becomes visible again", async () => {
  const { request } = stubWakeLock();
  renderHook(() => useWakeLock(true));
  await act(async () => {});
  expect(request).toHaveBeenCalledTimes(1);

  // jsdom reports visibilityState "visible", which is exactly the re-acquire case.
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(request).toHaveBeenCalledTimes(2);
});

test("missing wakeLock API is a silent no-op", async () => {
  const { unmount } = renderHook(() => useWakeLock(true));
  await act(async () => {});
  unmount(); // nothing to release, nothing thrown
});
