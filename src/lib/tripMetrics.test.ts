import { legDistanceM, tripMetrics } from "./tripMetrics";
import { mockPlanFor } from "../api/mock";
import type { Itinerary, PlanLeg } from "../api/types";

function leg(mode: string, minutes: number, distance_m: number | null, from = [52.3789, 4.9005], to = [52.3637, 4.8912]): PlanLeg {
  return {
    mode,
    minutes,
    distance_m,
    route: null,
    route_long_name: null,
    headsign: null,
    from: { name: null, lat: from[0], lon: from[1] },
    to: { name: null, lat: to[0], lon: to[1] },
    geometry: null,
    start_time: 0,
    end_time: minutes * 60_000,
    steps: [],
  };
}

function itin(legs: PlanLeg[]): Itinerary {
  const minutes = legs.reduce((s, l) => s + l.minutes, 0);
  return { minutes, distance_m: 0, start_time: 0, end_time: minutes * 60_000, legs };
}

test("legDistanceM prefers the distance the backend sent", () => {
  expect(legDistanceM(leg("BICYCLE", 10, 2500))).toBe(2500);
});

test("legDistanceM falls back to the great-circle distance between the leg endpoints", () => {
  // Centraal -> Vijzelgracht: ~1.8 km as the crow flies.
  const d = legDistanceM(leg("SUBWAY", 8, null));
  expect(d).not.toBeNull();
  expect(d!).toBeGreaterThan(1700);
  expect(d!).toBeLessThan(1900);
});

test("legDistanceM is null when there is neither a distance nor a pair of endpoints", () => {
  const l = leg("SUBWAY", 8, null);
  l.from = { name: null, lat: null, lon: null };
  expect(legDistanceM(l)).toBeNull();
});

test("a bike trip costs nothing, emits nothing and burns calories", () => {
  const m = tripMetrics(itin([leg("BICYCLE", 24, 4750)]));
  expect(m.fareEur).toBe(0);
  expect(m.co2Grams).toBe(0);
  expect(m.kcal).toBeGreaterThan(0);
});

test("walking burns calories but costs and emits nothing", () => {
  const m = tripMetrics(itin([leg("WALK", 12, 900)]));
  expect(m.fareEur).toBe(0);
  expect(m.co2Grams).toBe(0);
  expect(m.kcal).toBeGreaterThan(0);
});

test("a transit trip has a fare, and still counts the walk to the stop", () => {
  const it = mockPlanFor("A", "Bijlmer rain").options.find((o) => o.kind === "transit")!.itinerary;
  const m = tripMetrics(it);
  expect(m.fareEur).toBeGreaterThan(0);
  // Three walking legs, 12 minutes on foot: 3.8 MET * 79.1 kg * 0.2 h.
  expect(m.kcal).toBe(60);
});

test("an Amsterdam metro and tram trip emits nothing: GVB runs on Dutch green power", () => {
  // Not a missing number. The 2026 national factor list puts tram and metro at
  // 0 g per passenger-km because the municipal operators buy Dutch green electricity.
  const it = mockPlanFor("A", "Bijlmer rain").options.find((o) => o.kind === "transit")!.itinerary;
  const m = tripMetrics(it);
  expect(m.co2Grams).toBe(0);
  expect(m.co2Complete).toBe(true);
});

test("a bus leg is priced and charged for its emissions at the published rates", () => {
  // 5 km by bus: 104 g/passenger-km, and EUR 1.16 boarding + EUR 0.217/km.
  const m = tripMetrics(itin([leg("BUS", 15, 5000)]));
  expect(m.co2Grams).toBe(520);
  expect(m.fareEur).toBeCloseTo(2.25, 2);
});

test("a train leg emits at the 2026 rail factor", () => {
  // 10 km by train: 19 g/passenger-km, all of it upstream.
  const m = tripMetrics(itin([leg("RAIL", 12, 10_000)]));
  expect(m.co2Grams).toBe(190);
});

test("cycling burns the Compendium's commuting rate for an average Dutch adult", () => {
  // 6.8 MET * 79.1 kg * 0.4 h = 215 kcal.
  expect(tripMetrics(itin([leg("BICYCLE", 24, 4750)])).kcal).toBe(215);
});

test("one boarding fee covers a transfer made inside the 35-minute window", () => {
  const first = leg("SUBWAY", 8, 2000);
  const second = leg("TRAM", 9, 2000);
  second.start_time = first.end_time + 3 * 60_000;
  second.end_time = second.start_time + 9 * 60_000;
  // 1.16 once, then 0.217 * 4 km.
  expect(tripMetrics(itin([first, second])).fareEur).toBeCloseTo(2.03, 2);
});

test("a gap longer than 35 minutes starts a second journey and a second boarding fee", () => {
  const first = leg("SUBWAY", 8, 2000);
  const second = leg("TRAM", 9, 2000);
  second.start_time = first.end_time + 40 * 60_000;
  second.end_time = second.start_time + 9 * 60_000;
  expect(tripMetrics(itin([first, second])).fareEur).toBeCloseTo(3.19, 2);
});

test("a train leg makes the fare unquantifiable rather than approximate", () => {
  // NS prices from a tariff-unit table, not a distance rate, so there is no honest
  // linear estimate to give.
  expect(tripMetrics(itin([leg("RAIL", 12, 10_000)])).fareEur).toBeNull();
});

test("the IJ ferry is free to ride and has no published emission factor", () => {
  const m = tripMetrics(itin([leg("BICYCLE", 24, 6005), leg("FERRY", 14, 2468)]));
  expect(m.fareEur).toBe(0);
  // Counting it at the Westerschelde car-ferry rate would make it the dirtiest leg of
  // any Amsterdam trip; leaving it out silently would overstate how clean the trip is.
  expect(m.co2Grams).toBe(0);
  expect(m.co2Complete).toBe(false);
});

test("a bus leg with no distance to price makes the CO2 total a floor, not a total", () => {
  // The bus has a published factor of 104 g/passenger-km, so it certainly emits; with
  // neither a distance nor endpoints there is nothing to multiply, and the sum that
  // comes back is missing a leg. Reporting co2Complete: true here would pass a partial
  // sum off as the trip's emissions.
  const l = leg("BUS", 15, null);
  l.from = { name: null, lat: null, lon: null };
  l.to = { name: null, lat: null, lon: null };
  const m = tripMetrics(itin([l]));
  expect(m.co2Grams).toBe(0);
  expect(m.co2Complete).toBe(false);
});

test("calories scale with time on the pedals, emissions with kilometres on the bus", () => {
  const shortRide = tripMetrics(itin([leg("BICYCLE", 10, 2000)]));
  const longRide = tripMetrics(itin([leg("BICYCLE", 20, 4000)]));
  // Both figures are rounded to whole kcal, so allow the rounding to disagree by one.
  expect(longRide.kcal).toBeGreaterThanOrEqual(shortRide.kcal * 2 - 1);
  expect(longRide.kcal).toBeLessThanOrEqual(shortRide.kcal * 2 + 1);

  const shortBus = tripMetrics(itin([leg("BUS", 10, 2000)]));
  const longBus = tripMetrics(itin([leg("BUS", 10, 4000)]));
  expect(longBus.co2Grams).toBe(shortBus.co2Grams * 2);
});

test("a heavier rider burns more", () => {
  const light = tripMetrics(itin([leg("BICYCLE", 24, 4750)]), { bodyMassKg: 60 });
  const heavy = tripMetrics(itin([leg("BICYCLE", 24, 4750)]), { bodyMassKg: 90 });
  expect(heavy.kcal).toBeGreaterThan(light.kcal);
});
