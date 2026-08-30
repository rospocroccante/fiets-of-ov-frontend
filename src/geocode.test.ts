import { reverseGeocode } from "./geocode";

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
