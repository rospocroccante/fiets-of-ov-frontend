import { buildPlanView, departureLabel } from "./planView";
import { mockPlanFor } from "../api/mock";
import type { Plan, PlanLeg } from "../api/types";

function ferryLeg(mode: string, minutes: number, distance_m: number): PlanLeg {
  return {
    mode,
    minutes,
    distance_m,
    route: null,
    route_long_name: null,
    headsign: null,
    from: { name: null, lat: 52.34, lon: 4.87 },
    to: { name: null, lat: 52.4, lon: 4.89 },
    geometry: null,
    start_time: 0,
    end_time: minutes * 60_000,
    steps: [],
  };
}

// A pure-bike option that crosses the IJ on a GVB ferry (backend kind stays "bike").
function bikeWithFerryPlan(): Plan {
  const itinerary = {
    minutes: 40,
    distance_m: 8661,
    start_time: 0,
    end_time: 2_400_000,
    legs: [ferryLeg("BICYCLE", 24, 6005), ferryLeg("FERRY", 14, 2468), ferryLeg("BICYCLE", 2, 188)],
  };
  return {
    recommendation: "bike",
    reason: "",
    max_rain_mm_per_h: null,
    rain_expected: null,
    origin: { name: null, lat: 52.34, lon: 4.87 },
    destination: { name: null, lat: 52.4, lon: 4.89 },
    options: [{ kind: "bike", recommended: true, score: 41, rain_minutes: 0, itinerary }],
  };
}

test("recommended option is first; transit summarised by its lines", () => {
  const v = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  expect(v.options[0].recommended).toBe(true);
  expect(v.options[0].mode).toBe(v.recommendation);
  expect(v.recommendation).toBe("transit");
  const transit = v.options.find((o) => o.mode === "transit");
  expect(transit?.summary).toMatch(/Metro 52/);
});

test("bike-and-ride option is summarised with bike + line", () => {
  const v = buildPlanView(mockPlanFor("A", "Zuid mix"));
  const mix = v.options.find((o) => o.mode === "bike_and_ride");
  expect(mix).toBeTruthy();
  expect(mix?.summary).toMatch(/bike \d+ min/i);
  expect(mix?.summary).toMatch(/Metro 52/);
});

test("bike-only plan yields a single option summarised in km", () => {
  const v = buildPlanView(mockPlanFor("A", "Polder remote"));
  expect(v.options).toHaveLength(1);
  expect(v.options[0].mode).toBe("bike");
  expect(v.options[0].summary).toMatch(/km/);
});

test("bike km counts only bicycle legs and the ferry crossing is called out", () => {
  const v = buildPlanView(bikeWithFerryPlan());
  // 6005 m + 188 m of riding; the 2468 m ferry crossing is not "km by bike".
  expect(v.options[0].distanceKm).toBe(6.2);
  expect(v.options[0].summary).toBe("6.2 km by bike + ferry");
});

test("carries the rain fields through", () => {
  const v = buildPlanView(mockPlanFor("A", "Unknown spot"));
  expect(v.rainExpected).toBeNull();
});

test("departureLabel: leave now when imminent, clock time when the trip departs later", () => {
  const it = bikeWithFerryPlan().options[0].itinerary;
  const now = Date.UTC(2026, 6, 2, 12, 0);
  expect(departureLabel({ ...it, start_time: now + 90_000 }, now)).toBe("Leave now");
  expect(departureLabel({ ...it, start_time: now + 34 * 60_000 }, now)).toMatch(
    /^Leave at \d{1,2}[:.]\d{2}/,
  );
});
