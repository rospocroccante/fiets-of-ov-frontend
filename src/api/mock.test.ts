import { mockAdviceFor, mockPlanFor, mockStops } from "./mock";

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

test("plan dry trip recommends bike", () => {
  const plan = mockPlanFor("Centraal", "Vondelpark");
  expect(plan.recommendation).toBe("bike");
  expect(plan.options[0].recommended).toBe(true);
  expect(plan.options[0].kind).toBe("bike");
  expect(plan.rain_expected).toBe(false);
});

test("plan rainy trip recommends transit", () => {
  const plan = mockPlanFor("Centraal", "Bijlmer rain");
  expect(plan.recommendation).toBe("transit");
  expect(plan.options[0].recommended).toBe(true);
  expect(plan.options[0].kind).toBe("transit");
  expect(plan.options.some((o) => o.kind === "bike")).toBe(true);
});

test("plan mix/zuid trip recommends bike_and_ride", () => {
  const plan = mockPlanFor("Centraal", "mix destination");
  expect(plan.recommendation).toBe("bike_and_ride");
  expect(plan.options[0].recommended).toBe(true);
  expect(plan.options[0].kind).toBe("bike_and_ride");
  expect(plan.options.some((o) => o.kind === "transit")).toBe(true);
  expect(plan.options.some((o) => o.kind === "bike")).toBe(true);
});

test("plan remote trip recommends bike only", () => {
  const plan = mockPlanFor("Centraal", "Polder remote");
  expect(plan.recommendation).toBe("bike");
  expect(plan.options.length).toBe(1);
  expect(plan.options[0].kind).toBe("bike");
});

test("plan unknown weather recommends bike", () => {
  const plan = mockPlanFor("Centraal", "Unknown destination");
  expect(plan.recommendation).toBe("bike");
  expect(plan.rain_expected).toBeNull();
  expect(plan.options[0].recommended).toBe(true);
  expect(plan.options.some((o) => o.kind === "transit")).toBe(true);
});
