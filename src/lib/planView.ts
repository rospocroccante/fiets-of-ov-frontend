import type { Itinerary, Mode, Option, Plan } from "../api/types";
import { translate } from "./i18n";
import type { Lang, StringKey } from "./i18n";

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
const MODE_LABEL: Record<Lang, Record<string, string>> = {
  en: {
    SUBWAY: "Metro",
    METRO: "Metro",
    TRAM: "Tram",
    BUS: "Bus",
    RAIL: "Train",
    FERRY: "Ferry",
  },
  nl: {
    SUBWAY: "Metro",
    METRO: "Metro",
    TRAM: "Tram",
    BUS: "Bus",
    RAIL: "Trein",
    FERRY: "Pont",
  },
};

export function transitLabel(mode: string, lang: Lang = "en"): string {
  return MODE_LABEL[lang][mode] ?? mode.charAt(0) + mode.slice(1).toLowerCase();
}

function km(distanceM: number | null): number | null {
  return distanceM != null ? Math.round(distanceM / 100) / 10 : null;
}

function transitSummary(it: Itinerary, lang: Lang): string {
  const lines = it.legs
    .filter((l) => l.mode !== "WALK" && l.route)
    .map((l) => `${transitLabel(l.mode, lang)} ${l.route}`);
  return lines.length ? lines.join(" -> ") : translate(lang, "publicTransport");
}

const TITLE_KEY: Record<Mode, StringKey> = {
  bike: "byBike",
  transit: "publicTransport",
  bike_and_ride: "bikePlusTransit",
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

function summarise(kind: Mode, it: Itinerary, lang: Lang): string {
  if (kind === "bike") {
    const d = km(bikeDistanceM(it));
    // "Bike route" has no vetted Dutch line, so it stays English in both languages.
    const base = d != null ? translate(lang, "kmByBike", { d }) : "Bike route";
    return hasFerry(it) ? `${base} ${translate(lang, "plusFerry")}` : base;
  }
  if (kind === "transit") return transitSummary(it, lang);
  // bike_and_ride: short bike leg + the transit lines
  const bm = bikeMinutes(it);
  return bm > 0
    ? `${translate(lang, "bikeMinutes", { n: bm })} -> ${transitSummary(it, lang)}`
    : transitSummary(it, lang);
}

// When the itinerary leaves within a couple of minutes it is a leave-now trip; otherwise
// show the departure clock time — e.g. the next ferry worth catching leaves at 14:32.
// The ranking already charges that wait as cost; this only makes it visible.
export function departureLabel(it: Itinerary, nowMs: number, lang: Lang = "en"): string {
  const deltaMin = (it.start_time - nowMs) / 60_000;
  if (deltaMin <= 2) return translate(lang, "leaveNow");
  const t = new Date(it.start_time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return translate(lang, "leaveAtT", { t });
}

function toOptionView(option: Option, lang: Lang): OptionView {
  const it = option.itinerary;
  return {
    mode: option.kind,
    title: translate(lang, TITLE_KEY[option.kind]),
    minutes: it.minutes,
    distanceKm: option.kind === "bike" ? km(bikeDistanceM(it)) : null,
    recommended: option.recommended,
    summary: summarise(option.kind, it, lang),
    itinerary: it,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Backend reasons are compact machine strings ("rain around 15:10 (~1.2 mm/h) ->
// take tram 1 (29 min)"); rewrite them as plain sentences before they reach the
// advice banner. Pattern-matched on the backend's known phrasings, with a safe
// capitalise-and-punctuate fallback for anything new. The fallback stays English
// in both languages: an unknown phrasing must never be half-translated.
export function friendlyReason(reason: string, lang: Lang = "en"): string {
  const parts = reason.split(" -> ");
  if (parts.length !== 2) return reason;
  const [why, what] = parts;
  const nl = lang === "nl";

  let m: RegExpMatchArray | null;
  let whyOut: string;
  if ((m = why.match(/^dry during your (\d+)-min ride(?: \(rain only from (\d+:\d+)\))?$/))) {
    whyOut = m[2]
      ? nl
        ? `Het blijft naar verwachting droog tijdens je rit van ${m[1]} minuten (regen begint rond ${m[2]}).`
        : `It should stay dry for your ${m[1]}-minute ride (rain starts around ${m[2]}).`
      : nl
        ? `Het blijft naar verwachting droog tijdens je rit van ${m[1]} minuten.`
        : `It should stay dry for your ${m[1]}-minute ride.`;
  } else if ((m = why.match(/^rain around (\d+:\d+) \(~([\d.]+) mm\/h\)$/))) {
    whyOut = nl
      ? `Rond ${m[1]} wordt regen verwacht (tot ${m[2]} mm/u).`
      : `Rain is expected around ${m[1]} (up to ${m[2]} mm/h).`;
  } else if (why === "rain expected but no transit found") {
    whyOut = nl
      ? "Er komt regen aan en er is geen goed OV-alternatief."
      : "Rain is on the way and there is no good transit alternative.";
  } else if (why === "rain forecast unavailable") {
    whyOut = nl
      ? "De regenverwachting is momenteel niet beschikbaar."
      : "The rain forecast is unavailable right now.";
  } else if (nl && why === "dry") {
    whyOut = "Het blijft droog.";
  } else {
    whyOut = `${cap(why)}.`;
  }

  let whatOut: string;
  if (what === "bike") {
    whatOut = nl ? "Pak de fiets." : "Take the bike.";
  } else if ((m = what.match(/^fastest is bike \((\d+) min\)$/))) {
    whatOut = nl
      ? `De snelste optie is de fiets (${m[1]} min).`
      : `The fastest option is the bike (${m[1]} min).`;
  } else if ((m = what.match(/^fastest is bike and ride \((\d+) min\)$/))) {
    whatOut = nl
      ? `De snelste optie is fiets + OV (${m[1]} min).`
      : `The fastest option is bike and ride (${m[1]} min).`;
  } else if ((m = what.match(/^fastest is transit \((\d+) min\)$/))) {
    whatOut = nl
      ? `De snelste optie is het OV (${m[1]} min).`
      : `The fastest option is transit (${m[1]} min).`;
  } else if ((m = what.match(/^bike \((\d+) min\), bring a raincoat$/))) {
    whatOut = nl
      ? `Pak de fiets (${m[1]} min) en neem een regenjas mee.`
      : `Bike it in ${m[1]} minutes and bring a raincoat.`;
  } else if (nl && (m = what.match(/^bike to (.+?), then (.+)$/))) {
    whatOut = `Fiets naar ${m[1]}, daarna ${m[2]}.`;
  } else if (nl && (m = what.match(/^take (.+)$/))) {
    whatOut = `Neem ${m[1]}.`;
  } else {
    whatOut = `${cap(what)}.`;
  }

  return `${whyOut} ${whatOut}`;
}

export function buildPlanView(plan: Plan, lang: Lang = "en"): PlanView {
  // Backend returns options ranked, recommended first; preserve that order.
  const options = plan.options.map((o) => toOptionView(o, lang));
  return {
    recommendation: plan.recommendation,
    reason: friendlyReason(plan.reason, lang),
    rainExpected: plan.rain_expected,
    maxRain: plan.max_rain_mm_per_h,
    options,
  };
}
