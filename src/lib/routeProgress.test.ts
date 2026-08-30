import { buildNavRoute, progressAlong } from "./routeProgress";
import type { Itinerary, PlanLeg, PlanStep } from "../api/types";

// Fixtures use geometry: null so buildNavRoute falls back to the straight [from, to]
// line per leg; that keeps the expected lengths and offsets readable.
function mkLeg(
  mode: string,
  from: [number, number],
  to: [number, number],
  extra: Partial<PlanLeg> = {},
): PlanLeg {
  return {
    mode,
    minutes: 5,
    distance_m: null,
    route: null,
    route_long_name: null,
    headsign: null,
    from: { name: null, lat: from[0], lon: from[1] },
    to: { name: null, lat: to[0], lon: to[1] },
    geometry: null,
    start_time: 0,
    end_time: 300_000,
    steps: [],
    ...extra,
  };
}

function mkItinerary(legs: PlanLeg[]): Itinerary {
  return { minutes: 20, distance_m: 0, start_time: 0, end_time: 1_200_000, legs };
}

function step(direction: string, street: string, distance_m: number): PlanStep {
  return { direction, street, distance_m };
}

test("straight route: total length, midpoint progress and perpendicular offset", () => {
  // 0.01 deg of latitude is ~1112 m on the ellipsoid at 52.4N; the equirectangular
  // plane must land within 1%.
  const route = buildNavRoute(mkItinerary([mkLeg("BICYCLE", [52.37, 4.9], [52.38, 4.9])]));
  expect(Math.abs(route.total - 1112) / 1112).toBeLessThan(0.01);
  expect(route.cum[0]).toBe(0);
  expect(route.cum[route.cum.length - 1]).toBe(route.total);

  const mid = progressAlong(route, 52.375, 4.9);
  expect(mid.along).toBeCloseTo(route.total / 2, 3);
  expect(mid.remaining).toBeCloseTo(route.total - mid.along, 6);
  expect(mid.offRouteM).toBeCloseTo(0, 3);

  // 10 m east of the midpoint: snaps back onto the line, offRouteM reports the offset.
  const lonOff = 10 / (111_320 * Math.cos((52.375 * Math.PI) / 180));
  const beside = progressAlong(route, 52.375, 4.9 + lonOff);
  expect(beside.offRouteM).toBeCloseTo(10, 1);
  expect(beside.along).toBeCloseTo(route.total / 2, 3);
  expect(beside.snapped.lat).toBeCloseTo(52.375, 6);
  expect(beside.snapped.lon).toBeCloseTo(4.9, 6);
  expect(beside.remaining).toBeCloseTo(route.total - beside.along, 6);
});

test("L-shaped route: snapping picks the nearest segment", () => {
  const route = buildNavRoute(
    mkItinerary([
      mkLeg("BICYCLE", [52.37, 4.9], [52.38, 4.9]),
      mkLeg("BICYCLE", [52.38, 4.9], [52.38, 4.92]),
    ]),
  );
  // Seam point shared by the two legs is deduplicated.
  expect(route.points).toHaveLength(3);

  // A fix just north of the second arm's midpoint must map onto the second segment,
  // not onto the (much farther) first one.
  const p = progressAlong(route, 52.3805, 4.91);
  const firstSegLen = route.cum[1];
  expect(p.along).toBeGreaterThan(firstSegLen);
  expect(p.snapped.lat).toBeCloseTo(52.38, 6);
  expect(p.snapped.lon).toBeCloseTo(4.91, 5);
  expect(p.offRouteM).toBeCloseTo(55.3, 0);
});

test("buildNavRoute: cumulative maneuvers, BOARD/ALIGHT labels, ARRIVE, DEPART dropped", () => {
  const bike = mkLeg("BICYCLE", [52.37, 4.9], [52.38, 4.9], {
    steps: [step("DEPART", "Ceintuurbaan", 500), step("LEFT", "Ferdinand Bolstraat", 605)],
  });
  const tram = mkLeg("TRAM", [52.38, 4.9], [52.38, 4.93], {
    route: "1",
    headsign: "Osdorp",
    to: { name: "Surinameplein", lat: 52.38, lon: 4.93 },
  });
  const route = buildNavRoute(mkItinerary([bike, tram]));

  expect(route.maneuvers.map((m) => m.direction)).toEqual(["LEFT", "BOARD", "ALIGHT", "ARRIVE"]);

  const [left, board, alight, arrive] = route.maneuvers;
  // LEFT sits 500 m into the bike leg (after the dropped DEPART step's distance).
  expect(left.at).toBeCloseTo(500, 6);
  expect(left.street).toBe("Ferdinand Bolstraat");
  expect(left.legIndex).toBe(0);

  // BOARD at the tram leg start = cumulative end of the bike leg.
  expect(board.at).toBeCloseTo(route.cum[1], 6);
  expect(board.at).toBeGreaterThan(left.at);
  expect(board.street).toBe("Tram 1 towards Osdorp");
  expect(board.legIndex).toBe(1);

  expect(alight.at).toBeCloseTo(route.total, 6);
  expect(alight.street).toBe("Surinameplein");
  expect(alight.legIndex).toBe(1);

  expect(arrive.at).toBe(route.total);
  expect(arrive.street).toBeNull();
});

test("progressAlong past the last maneuver: ARRIVE stays next, remaining reaches 0", () => {
  const route = buildNavRoute(mkItinerary([mkLeg("BICYCLE", [52.37, 4.9], [52.38, 4.9])]));

  // ~110 m before the end: the only maneuver ahead is ARRIVE.
  const near = progressAlong(route, 52.379, 4.9);
  expect(near.next?.direction).toBe("ARRIVE");
  expect(near.toNext).toBeCloseTo(route.total - near.along, 6);

  // Past the endpoint: progress clamps to the route end.
  const past = progressAlong(route, 52.3801, 4.9);
  expect(past.along).toBeCloseTo(route.total, 6);
  expect(past.remaining).toBeCloseTo(0, 6);
  expect(past.next).toBeNull();
  expect(past.toNext).toBe(0);
  expect(past.snapped.lat).toBeCloseTo(52.38, 6);
});
