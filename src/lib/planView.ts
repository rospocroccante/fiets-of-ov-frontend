import type { Itinerary, Mode, Plan } from "../api/types";

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

function bikeOption(plan: Plan, recommended: boolean): OptionView {
  const it = plan.bike;
  const d = km(it.distance_m);
  return {
    mode: "bike",
    title: "By bike",
    minutes: it.minutes,
    distanceKm: d,
    recommended,
    summary: d != null ? `${d} km by bike` : "Bike route",
    itinerary: it,
  };
}

function transitOption(it: Itinerary, recommended: boolean): OptionView {
  return {
    mode: "transit",
    title: "Public transport",
    minutes: it.minutes,
    distanceKm: null,
    recommended,
    summary: transitSummary(it),
    itinerary: it,
  };
}

export function buildPlanView(plan: Plan): PlanView {
  const options: OptionView[] = [bikeOption(plan, plan.recommendation === "bike")];
  if (plan.transit) {
    options.push(transitOption(plan.transit, plan.recommendation === "transit"));
  }
  // Recommended option first.
  options.sort((a, b) => Number(b.recommended) - Number(a.recommended));
  return {
    recommendation: plan.recommendation,
    reason: plan.reason,
    rainExpected: plan.rain_expected,
    maxRain: plan.max_rain_mm_per_h,
    options,
  };
}
