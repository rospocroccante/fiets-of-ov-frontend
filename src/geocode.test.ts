import { geocode, parseLatLon } from "./geocode";

test("parses explicit lat,lon", () => {
  expect(parseLatLon("52.3676, 4.9041")).toEqual({ lat: 52.3676, lon: 4.9041 });
});

test("non-coords returns null from parseLatLon", () => {
  expect(parseLatLon("Vondelpark")).toBeNull();
});

test("mock geocode resolves a known place", async () => {
  const c = await geocode("Amsterdam Centraal");
  expect(c.lat).toBeGreaterThan(52);
  expect(c.lon).toBeGreaterThan(4);
});

test("mock geocode falls back to Amsterdam center", async () => {
  const c = await geocode("Some unknown place");
  expect(c).toEqual({ lat: 52.3728, lon: 4.8936 });
});
