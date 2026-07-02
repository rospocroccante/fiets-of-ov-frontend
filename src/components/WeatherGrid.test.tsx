import { windColor, windRotation } from "./WeatherGrid";

test("wind color scales with cyclist-relevant severity", () => {
  expect(windColor(10)).toBe("#64748b"); // barely noticeable
  expect(windColor(20)).toBe("#d97706"); // a real headwind
  expect(windColor(35)).toBe("#dc2626"); // hold your handlebars
});

test("arrow points where the wind blows, not where it comes from", () => {
  // Meteorological 0 = from the north -> arrow points south (180).
  expect(windRotation(0)).toBe(180);
  // From the west (270) -> blowing east (90).
  expect(windRotation(270)).toBe(90);
});
