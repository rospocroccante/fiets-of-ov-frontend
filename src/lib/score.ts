import type { Advice, Mode } from "../api/types";

export interface CardModel {
  mode: Mode;
  title: string;
  minutes: number | null;
  recommended: boolean;
  chips: string[];
  reason?: string;
}

export interface ScoreResult {
  recommendation: Mode;
  cards: CardModel[];
}

function rainChip(advice: Advice): string {
  if (advice.rain_expected === null) return "forecast unavailable";
  if (advice.rain_expected === false) return "dry";
  const mm = advice.max_rain_mm_per_h;
  return mm != null ? `rain ~${mm} mm/h` : "rain expected";
}

function bikeCard(advice: Advice, recommended: boolean): CardModel {
  const chips = [`${advice.bike_minutes} min`, rainChip(advice)];
  return {
    mode: "bike",
    title: "By bike",
    minutes: advice.bike_minutes,
    recommended,
    chips,
    reason: recommended ? advice.reason : undefined,
  };
}

function transitCard(advice: Advice, recommended: boolean): CardModel {
  const hasTransit = advice.transit_minutes != null;
  const chips = hasTransit
    ? [`${advice.transit_minutes} min`, "covered"]
    : ["no line found"];
  return {
    mode: "transit",
    title: "Public transport",
    minutes: advice.transit_minutes,
    recommended,
    chips,
    reason: recommended ? advice.reason : undefined,
  };
}

export function scoreAdvice(advice: Advice): ScoreResult {
  const bike = bikeCard(advice, advice.recommendation === "bike");
  const transit = transitCard(advice, advice.recommendation === "transit");
  const cards = advice.recommendation === "transit" ? [transit, bike] : [bike, transit];
  return { recommendation: advice.recommendation, cards };
}
