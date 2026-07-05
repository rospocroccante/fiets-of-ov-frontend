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

// When the itinerary leaves within a couple of minutes it is a leave-now trip; otherwise
// show the departure clock time — e.g. the next ferry worth catching leaves at 14:32.
// The ranking already charges that wait as cost; this only makes it visible.
export function departureLabel(it: Itinerary, nowMs: number): string {
  const deltaMin = (it.start_time - nowMs) / 60_000;
  if (deltaMin <= 2) return "Leave now";
  const t = new Date(it.start_time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Leave at ${t}`;
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Backend reasons are compact machine strings ("rain around 15:10 (~1.2 mm/h) ->
// take tram 1 (29 min)"); rewrite them as plain sentences before they reach the
// advice banner. Pattern-matched on the backend's known phrasings, with a safe
// capitalise-and-punctuate fallback for anything new.
export function friendlyReason(reason: string): string {
  const parts = reason.split(" -> ");
  if (parts.length !== 2) return reason;
  const [why, what] = parts;

  let m: RegExpMatchArray | null;
  let whyOut: string;
  if ((m = why.match(/^dry during your (\d+)-min ride(?: \(rain only from (\d+:\d+)\))?$/))) {
    whyOut = m[2]
      ? `It should stay dry for your ${m[1]}-minute ride (rain starts around ${m[2]}).`
      : `It should stay dry for your ${m[1]}-minute ride.`;
  } else if ((m = why.match(/^rain around (\d+:\d+) \(~([\d.]+) mm\/h\)$/))) {
    whyOut = `Rain is expected around ${m[1]} (up to ${m[2]} mm/h).`;
  } else if (why === "rain expected but no transit found") {
    whyOut = "Rain is on the way and there is no good transit alternative.";
  } else if (why === "rain forecast unavailable") {
    whyOut = "The rain forecast is unavailable right now.";
  } else {
    whyOut = `${cap(why)}.`;
  }

  let whatOut: string;
  if (what === "bike") {
    whatOut = "Take the bike.";
  } else if ((m = what.match(/^fastest is bike \((\d+) min\)$/))) {
    whatOut = `The fastest option is the bike (${m[1]} min).`;
  } else if ((m = what.match(/^bike \((\d+) min\), bring a raincoat$/))) {
    whatOut = `Bike it in ${m[1]} minutes and bring a raincoat.`;
  } else {
    whatOut = `${cap(what)}.`;
  }

  return `${whyOut} ${whatOut}`;
}

export function buildPlanView(plan: Plan): PlanView {
  // Backend returns options ranked, recommended first; preserve that order.
  const options = plan.options.map(toOptionView);
  return {
    recommendation: plan.recommendation,
    reason: friendlyReason(plan.reason),
    rainExpected: plan.rain_expected,
    maxRain: plan.max_rain_mm_per_h,
    options,
  };
}
