import { geocode, parseLatLon, reverseGeocode } from "./geocode";

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

test("reverseGeocode maps a click near a known place to its name (mock mode)", async () => {
  // Vondelpark is a KNOWN place at (52.3580, 4.8686).
  const name = await reverseGeocode(52.3581, 4.8687);
  expect(name.toLowerCase()).toContain("vondelpark");
});

test("reverseGeocode of coordinates far from any known place returns the coordinates", async () => {
  const name = await reverseGeocode(52.30, 4.70);
  expect(name).toMatch(/52\.3/);
  expect(name).toMatch(/4\.7/);
});
