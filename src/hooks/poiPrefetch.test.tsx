import { prefetchAmsterdamPois } from "./usePois";
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
