import type { Advice, Itinerary, Mode, Option, Plan, PlanLeg, Place, Stop } from "./types";

// Deterministic fixtures keyed by case-insensitive substrings in the destination,
// covering the four advice shapes the UI must handle.
export function mockAdviceFor(_from: string, to: string): Advice {
  const t = to.toLowerCase();
  if (t.includes("rain") || t.includes("regen")) {
    return {
      recommendation: "transit",
      reason: "rain around 15:10 (~1.2 mm/h) -> take tram 13 (28 min)",
      bike_minutes: 22,
      transit_minutes: 28,
      max_rain_mm_per_h: 1.2,
      rain_expected: true,
    };
  }
  if (t.includes("remote") || t.includes("polder")) {
    return {
      recommendation: "bike",
      reason:
        "rain expected around 15:10 but no transit found -> bike (24 min), bring a raincoat",
      bike_minutes: 24,
      transit_minutes: null,
      max_rain_mm_per_h: 0.8,
      rain_expected: true,
    };
  }
  if (t.includes("unknown") || t.includes("fog")) {
    return {
      recommendation: "bike",
      reason: "rain forecast unavailable -> bike (19 min)",
      bike_minutes: 19,
      transit_minutes: 26,
      max_rain_mm_per_h: null,
      rain_expected: null,
    };
  }
  return {
    recommendation: "bike",
    reason: "dry during your 24-min ride (rain only from 15:40) -> bike",
    bike_minutes: 24,
    transit_minutes: 30,
    max_rain_mm_per_h: 0.0,
    rain_expected: false,
  };
}

// A representative set of well-known Amsterdam places for offline autocomplete.
export const MOCK_PLACES: Place[] = [
  { id: "centraal", name: "Amsterdam Centraal", label: "Amsterdam Centraal, Stationsplein", lat: 52.3791, lon: 4.9003 },
  { id: "dam", name: "Dam", label: "Dam, Centrum", lat: 52.3731, lon: 4.8926 },
  { id: "vondelpark", name: "Vondelpark", label: "Vondelpark, Zuid", lat: 52.358, lon: 4.8686 },
  { id: "rijksmuseum", name: "Rijksmuseum", label: "Rijksmuseum, Museumstraat", lat: 52.36, lon: 4.8852 },
  { id: "vangogh", name: "Van Gogh Museum", label: "Van Gogh Museum, Museumplein", lat: 52.3584, lon: 4.8811 },
  { id: "leidseplein", name: "Leidseplein", label: "Leidseplein, Centrum", lat: 52.3641, lon: 4.8818 },
  { id: "rembrandtplein", name: "Rembrandtplein", label: "Rembrandtplein, Centrum", lat: 52.3663, lon: 4.8957 },
  { id: "jordaan", name: "Jordaan", label: "Jordaan, West", lat: 52.3738, lon: 4.8807 },
  { id: "depijp", name: "De Pijp", label: "De Pijp, Zuid", lat: 52.3547, lon: 4.8925 },
  { id: "bijlmer", name: "Bijlmer ArenA", label: "Bijlmer ArenA, Zuidoost", lat: 52.3119, lon: 4.9476 },
  { id: "zuid", name: "Amsterdam Zuid", label: "Amsterdam Zuid station, Zuid", lat: 52.3389, lon: 4.8727 },
  { id: "sloterdijk", name: "Amsterdam Sloterdijk", label: "Amsterdam Sloterdijk station, West", lat: 52.3887, lon: 4.8378 },
  { id: "oost", name: "Amsterdam Oost", label: "Amsterdam Oost, Oost", lat: 52.3585, lon: 4.9295 },
  { id: "westerpark", name: "Westerpark", label: "Westerpark, West", lat: 52.387, lon: 4.8758 },
  { id: "oosterpark", name: "Oosterpark", label: "Oosterpark, Oost", lat: 52.3582, lon: 4.921 },
  { id: "museumplein", name: "Museumplein", label: "Museumplein, Zuid", lat: 52.3579, lon: 4.8807 },
  { id: "annefrank", name: "Anne Frank House", label: "Anne Frank House, Prinsengracht", lat: 52.3752, lon: 4.8839 },
  { id: "ndsm", name: "NDSM Wharf", label: "NDSM Wharf, Noord", lat: 52.4014, lon: 4.8918 },
  { id: "amstel", name: "Amstel Station", label: "Amstel Station, Oost", lat: 52.3469, lon: 4.9176 },
  { id: "nieuwmarkt", name: "Nieuwmarkt", label: "Nieuwmarkt, Centrum", lat: 52.3725, lon: 4.9006 },
];

export function mockSearchPlaces(query: string): Place[] {
  const s = query.trim().toLowerCase();
  if (!s) return [];
  return MOCK_PLACES.filter((p) => p.label.toLowerCase().includes(s)).slice(0, 6);
}

export function mockStops(lat: number, lon: number): Stop[] {
  const base = [
    { name: "Dam", dlat: 0.001, dlon: 0.0015, code: "GVB-001" },
    { name: "Spui", dlat: -0.002, dlon: 0.001, code: "GVB-002" },
    { name: "Leidseplein", dlat: 0.0015, dlon: -0.002, code: "GVB-003" },
    { name: "Waterlooplein", dlat: -0.001, dlon: -0.0015, code: "GVB-004" },
  ];
  return base.map((b, i) => ({
    stop_id: `mock-${i}`,
    code: b.code,
    name: b.name,
    lat: lat + b.dlat,
    lon: lon + b.dlon,
    location_type: 0,
    distance_m: Math.round((Math.abs(b.dlat) + Math.abs(b.dlon)) * 111000),
  }));
}

// Offline fixture for GET /v1/plan: a drawable bike + transit itinerary. Legs carry
// from/to coords (no encoded geometry) so the map draws straight segments in mock mode;
// live mode supplies real per-leg geometry.
const MS = 1_700_000_000_000;
const at = (min: number) => MS + min * 60_000;
const ref = (name: string | null, lat: number, lon: number) => ({ name, lat, lon });

function mockBikeItin(): Itinerary {
  const leg: PlanLeg = {
    mode: "BICYCLE",
    minutes: 24,
    distance_m: 4750,
    route: null,
    route_long_name: null,
    headsign: null,
    from: ref("Amsterdam Centraal", 52.3791, 4.9003),
    to: ref("Vondelpark", 52.358, 4.8686),
    geometry: null,
    start_time: MS,
    end_time: at(24),
    steps: [],
  };
  return { minutes: 24, distance_m: 4750, start_time: MS, end_time: at(24), legs: [leg] };
}

function mockTransitItin(): Itinerary {
  const legs: PlanLeg[] = [
    { mode: "WALK", minutes: 4, distance_m: 300, route: null, route_long_name: null, headsign: null, from: ref("Amsterdam Centraal", 52.3791, 4.9003), to: ref("Centraal Station", 52.3789, 4.9005), geometry: null, start_time: MS, end_time: at(4), steps: [] },
    { mode: "SUBWAY", minutes: 8, distance_m: null, route: "52", route_long_name: "Noord/Zuidlijn", headsign: "Zuid", from: ref("Centraal Station", 52.3789, 4.9005), to: ref("Vijzelgracht", 52.3637, 4.8912), geometry: null, start_time: at(4), end_time: at(12), steps: [] },
    { mode: "WALK", minutes: 3, distance_m: 200, route: null, route_long_name: null, headsign: null, from: ref("Vijzelgracht", 52.3637, 4.8912), to: ref("Vijzelgracht", 52.3637, 4.8912), geometry: null, start_time: at(12), end_time: at(15), steps: [] },
    { mode: "TRAM", minutes: 9, distance_m: null, route: "1", route_long_name: "Tram 1", headsign: "Osdorp", from: ref("Vijzelgracht", 52.3637, 4.8912), to: ref("Rhijnvis Feithstraat", 52.3596, 4.8676), geometry: null, start_time: at(15), end_time: at(24), steps: [] },
    { mode: "WALK", minutes: 5, distance_m: 350, route: null, route_long_name: null, headsign: null, from: ref("Rhijnvis Feithstraat", 52.3596, 4.8676), to: ref("Vondelpark", 52.358, 4.8686), geometry: null, start_time: at(24), end_time: at(29), steps: [] },
  ];
  return { minutes: 29, distance_m: 0, start_time: MS, end_time: at(29), legs };
}

function mockBikeRideItin(): Itinerary {
  const legs: PlanLeg[] = [
    { mode: "BICYCLE", minutes: 6, distance_m: 1300, route: null, route_long_name: null, headsign: null, from: ref("Amsterdam Centraal", 52.3791, 4.9003), to: ref("Weesperplein", 52.3617, 4.9087), geometry: null, start_time: MS, end_time: at(6), steps: [] },
    { mode: "SUBWAY", minutes: 7, distance_m: null, route: "52", route_long_name: "Noord/Zuidlijn", headsign: "Zuid", from: ref("Weesperplein", 52.3617, 4.9087), to: ref("Europaplein", 52.3395, 4.8918), geometry: null, start_time: at(6), end_time: at(13), steps: [] },
    { mode: "WALK", minutes: 4, distance_m: 300, route: null, route_long_name: null, headsign: null, from: ref("Europaplein", 52.3395, 4.8918), to: ref("Vondelpark", 52.358, 4.8686), geometry: null, start_time: at(13), end_time: at(17), steps: [] },
  ];
  return { minutes: 17, distance_m: 1600, start_time: MS, end_time: at(17), legs };
}

function opt(kind: Mode, recommended: boolean, rain_minutes: number, score: number, itinerary: Itinerary): Option {
  return { kind, recommended, rain_minutes, score, itinerary };
}

export function mockPlanFor(_from: string, to: string): Plan {
  const t = to.toLowerCase();
  const origin = ref("Amsterdam Centraal", 52.3791, 4.9003);
  const destination = ref("Vondelpark", 52.358, 4.8686);
  const base = { origin, destination };

  if (t.includes("rain") || t.includes("regen")) {
    return {
      ...base,
      recommendation: "transit",
      reason: "rain around 15:10 (~1.2 mm/h) -> take tram 1 (29 min)",
      max_rain_mm_per_h: 1.2,
      rain_expected: true,
      options: [
        opt("transit", true, 0, 29, mockTransitItin()),
        opt("bike", false, 22, 46, mockBikeItin()),
      ],
    };
  }
  if (t.includes("mix") || t.includes("zuid")) {
    return {
      ...base,
      recommendation: "bike_and_ride",
      reason: "rain around 15:10 (~1.0 mm/h) -> bike to Weesperplein, then metro 52 (17 min)",
      max_rain_mm_per_h: 1.0,
      rain_expected: true,
      options: [
        opt("bike_and_ride", true, 6, 23, mockBikeRideItin()),
        opt("transit", false, 0, 29, mockTransitItin()),
        opt("bike", false, 24, 48, mockBikeItin()),
      ],
    };
  }
  if (t.includes("remote") || t.includes("polder")) {
    return {
      ...base,
      recommendation: "bike",
      reason: "rain expected but no transit found -> bike (24 min), bring a raincoat",
      max_rain_mm_per_h: 0.8,
      rain_expected: true,
      options: [opt("bike", true, 24, 50, mockBikeItin())],
    };
  }
  if (t.includes("unknown") || t.includes("fog")) {
    return {
      ...base,
      recommendation: "bike",
      reason: "rain forecast unavailable -> fastest is bike (24 min)",
      max_rain_mm_per_h: null,
      rain_expected: null,
      options: [
        opt("bike", true, 0, 24, mockBikeItin()),
        opt("transit", false, 0, 29, mockTransitItin()),
      ],
    };
  }
  return {
    ...base,
    recommendation: "bike",
    reason: "dry during your 24-min ride (rain only from 15:40) -> bike",
    max_rain_mm_per_h: 0.0,
    rain_expected: false,
    options: [
      opt("bike", true, 0, 24, mockBikeItin()),
      opt("transit", false, 0, 29, mockTransitItin()),
    ],
  };
}
