import { prefetchAmsterdamPois, fullyCoveredCellKeys } from "./usePois";
import { getCell, __resetPoiStore } from "../lib/poiStore";

// The prefetch is a live-mode feature; force the live path (the rest of the suite
// runs this module in mock mode).
vi.mock("../api/client", () => ({ isLive: () => true }));

afterEach(() => {
  __resetPoiStore();
  window.localStorage.clear();
});

test("bulk prefetch chunks the city into cells and marks the rest known-empty", async () => {
  const elements = [
    { id: 1, lat: 52.3705, lon: 4.8905, tags: { amenity: "bar", name: "Bar A" } },
    { id: 2, lat: 52.3706, lon: 4.8906, tags: { tourism: "museum", name: "Museum M" } },
  ];
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ elements }) }));
  vi.stubGlobal("fetch", fetchMock);

  await prefetchAmsterdamPois();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Both POIs land in their grid cell (0.01 lat x 0.015 lon).
  const key = `${Math.floor(52.3705 / 0.01)}:${Math.floor(4.8905 / 0.015)}`;
  expect(getCell(key)?.map((p) => p.name).sort()).toEqual(["Bar A", "Museum M"]);

  // A cell inside the swept area with no results is stored as known-empty, so the
  // on-demand path will not hit the network for it.
  const emptyKey = `${Math.floor(52.33 / 0.01)}:${Math.floor(4.82 / 0.015)}`;
  expect(getCell(emptyKey)).toEqual([]);

  // A second call within the TTL is a no-op (one bulk sweep per week).
  fetchMock.mockClear();
  await prefetchAmsterdamPois();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the sweep marks known-empty only the cells it covered whole", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ elements: [] }) }));
  vi.stubGlobal("fetch", fetchMock);

  await prefetchAmsterdamPois();

  // An interior cell is proven empty by the sweep.
  expect(getCell("5233:321")).toEqual([]);
  // The top row (52.43-52.44) and the east column (4.98-4.995) poke past the swept bbox (north 52.43, east 4.99).
  // The old Math.floor bounds marked them known-empty and pinned that for a week; they must stay unknown.
  expect(getCell("5243:321")).toBeNull();
  expect(getCell("5233:332")).toBeNull();
});

test("fullyCoveredCellKeys: aligned edges stay in, partial rows and columns stay out", () => {
  // An unaligned box proves only the one cell it contains whole (52.33-52.34 x 4.815-4.83).
  const keys = new Set(fullyCoveredCellKeys({ south: 52.325, west: 4.81, north: 52.345, east: 4.844 }));
  expect(keys).toEqual(new Set(["5233:321"]));

  // Cell-aligned edges are covered exactly, without float-noise off-by-ones.
  const aligned = new Set(fullyCoveredCellKeys({ south: 52.32, west: 4.8, north: 52.34, east: 4.83 }));
  expect(aligned).toEqual(new Set(["5232:320", "5232:321", "5233:320", "5233:321"]));
});
