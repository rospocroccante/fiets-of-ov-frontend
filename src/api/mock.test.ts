import { mockAdviceFor, mockStops } from "./mock";

test("dry trip recommends bike", () => {
  const a = mockAdviceFor("Centraal", "Vondelpark");
  expect(a.recommendation).toBe("bike");
  expect(a.rain_expected).toBe(false);
  expect(a.bike_minutes).toBeGreaterThan(0);
});

test("rainy destination recommends transit", () => {
  const a = mockAdviceFor("Centraal", "Bijlmer rain");
  expect(a.recommendation).toBe("transit");
  expect(a.rain_expected).toBe(true);
  expect(a.transit_minutes).not.toBeNull();
});

test("no-transit keyword yields bike with null transit", () => {
  const a = mockAdviceFor("Centraal", "Polder remote");
  expect(a.recommendation).toBe("bike");
  expect(a.transit_minutes).toBeNull();
});

test("degraded keyword yields null rain fields", () => {
  const a = mockAdviceFor("Centraal", "Unknown spot");
  expect(a.rain_expected).toBeNull();
  expect(a.max_rain_mm_per_h).toBeNull();
});

test("mockStops returns nearby stops", () => {
  const s = mockStops(52.36, 4.88);
  expect(s.length).toBeGreaterThan(0);
  expect(s[0]).toHaveProperty("name");
});
