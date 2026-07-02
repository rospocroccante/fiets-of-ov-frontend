import type { Itinerary, Mode, Option, Plan } from "../api/types";

// View-model for the results panel: one OptionView per available mode, recommended first.
export interface OptionView {
  mode: Mode;
  title: string;
  minutes: number;
  distanceKm: number | null;
  recommended: boolean;
  summary: string; // e.g. "Metro 52 -> Tram 1" or "4.8 km"
  itinerary: Itinerary;
}

export interface PlanView {
  recommendation: Mode;
  reason: string;
  rainExpected: boolean | null;
  maxRain: number | null;
  options: OptionView[];
}

// Human label per OTP transit mode.
const MODE_LABEL: Record<string, string> = {
  SUBWAY: "Metro",
  METRO: "Metro",
  TRAM: "Tram",
  BUS: "Bus",
  RAIL: "Train",
  FERRY: "Ferry",
};

export function transitLabel(mode: string): string {
  return MODE_LABEL[mode] ?? mode.charAt(0) + mode.slice(1).toLowerCase();
}

function km(distanceM: number | null): number | null {
  return distanceM != null ? Math.round(distanceM / 100) / 10 : null;
}

function transitSummary(it: Itinerary): string {
  const lines = it.legs
    .filter((l) => l.mode !== "WALK" && l.route)
    .map((l) => `${transitLabel(l.mode)} ${l.route}`);
  return lines.length ? lines.join(" -> ") : "Public transport";
}

const TITLE: Record<Mode, string> = {
  bike: "By bike",
  transit: "Public transport",
  bike_and_ride: "Bike + transit",
};

function bikeMinutes(it: Itinerary): number {
  return it.legs
    .filter((l) => l.mode === "BICYCLE")
    .reduce((sum, l) => sum + l.minutes, 0);
}

// Distance actually ridden: a "bike" itinerary may include a GVB ferry crossing whose
// metres are not cycled, so sum the BICYCLE legs instead of the itinerary total.
function bikeDistanceM(it: Itinerary): number | null {
  const legs = it.legs.filter((l) => l.mode === "BICYCLE");
  if (!legs.length) return it.distance_m;
  return legs.reduce((sum, l) => sum + (l.distance_m ?? 0), 0);
}

function hasFerry(it: Itinerary): boolean {
  return it.legs.some((l) => l.mode === "FERRY");
}

function summarise(kind: Mode, it: Itinerary): string {
  if (kind === "bike") {
    const d = km(bikeDistanceM(it));
    const base = d != null ? `${d} km by bike` : "Bike route";
    return hasFerry(it) ? `${base} + ferry` : base;
  }
  if (kind === "transit") return transitSummary(it);
  // bike_and_ride: short bike leg + the transit lines
  const bm = bikeMinutes(it);
  return bm > 0 ? `Bike ${bm} min -> ${transitSummary(it)}` : transitSummary(it);
}

function toOptionView(option: Option): OptionView {
  const it = option.itinerary;
  return {
    mode: option.kind,
    title: TITLE[option.kind],
    minutes: it.minutes,
    distanceKm: option.kind === "bike" ? km(bikeDistanceM(it)) : null,
    recommended: option.recommended,
    summary: summarise(option.kind, it),
    itinerary: it,
  };
}

export function buildPlanView(plan: Plan): PlanView {
  // Backend returns options ranked, recommended first; preserve that order.
  const options = plan.options.map(toOptionView);
  return {
    recommendation: plan.recommendation,
    reason: plan.reason,
    rainExpected: plan.rain_expected,
    maxRain: plan.max_rain_mm_per_h,
    options,
  };
}
