import { getCell, putCell, __resetPoiStore } from "./poiStore";
import type { Poi } from "../hooks/usePois";

const POI: Poi = { id: "p1", name: "Bar X", kind: "drink", kindLabel: "Bar", lat: 52.37, lon: 4.89 };

afterEach(() => {
  __resetPoiStore();
  window.localStorage.clear();
  vi.useRealTimers();
});

test("put/get roundtrip; a debounced persist survives a memory reset", () => {
  vi.useFakeTimers();
  putCell("5237:326", [POI]);
  expect(getCell("5237:326")?.[0].name).toBe("Bar X");

  // After the debounce the blob is in localStorage: a fresh in-memory store
  // (new page load) still answers.
  vi.advanceTimersByTime(1100);
  __resetPoiStore();
  expect(getCell("5237:326")?.[0].name).toBe("Bar X");
});

test("a pending persist is flushed on pagehide, so a dying tab loses nothing", () => {
  vi.useFakeTimers();
  putCell("5237:326", [POI]);
  // The debounce timer never fires because the tab is closing: pagehide must write the blob out itself.
  window.dispatchEvent(new Event("pagehide"));
  __resetPoiStore();
  expect(getCell("5237:326")?.[0].name).toBe("Bar X");
});

test("entries expire after the TTL; known-empty cells are served, not refetched", () => {
  vi.useFakeTimers({ now: new Date("2026-07-07T10:00:00Z") });
  putCell("1:1", []);
  // Empty array is a valid answer ("no places here"), distinct from null (unknown).
  expect(getCell("1:1")).toEqual([]);

  vi.setSystemTime(new Date("2026-07-15T10:00:01Z"));
  expect(getCell("1:1")).toBeNull();
});
