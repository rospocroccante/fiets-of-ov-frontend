import type { Itinerary, PlanLeg } from "../api/types";
import { translate, useI18n } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import { modeColor } from "../lib/modeColors";
import { transitLabel } from "../lib/planView";
import { DEFAULT_BODY_MASS_KG, legDistanceM, tripMetrics } from "../lib/tripMetrics";

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function legTitle(leg: PlanLeg, lang: Lang): string {
  if (leg.mode === "WALK") return translate(lang, "walk");
  if (leg.mode === "BICYCLE") return translate(lang, "bike");
  return `${transitLabel(leg.mode, lang)} ${leg.route ?? ""}`.trim();
}

// WCAG relative luminance of a "#rrggbb".
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Ink for a chip filled with the leg's own line colour. The chip colour has to stay
// exactly the colour of that leg on the map, so the readable half of the pair is the
// text: white on the walking grey measured 2.56:1 and on the bike green 3.77:1, both
// well under AA for 12px. Picking whichever of near-black and white contrasts better
// against the fill keeps every mode at 4.7:1 or above without moving a single hue.
const CHIP_DARK = "#111827";
export function chipInk(background: string): string {
  const bg = luminance(background);
  const onWhite = 1.05 / (bg + 0.05);
  const onDark = (bg + 0.05) / (luminance(CHIP_DARK) + 0.05);
  return onDark > onWhite ? CHIP_DARK : "#ffffff";
}

/**
 * The selected option's itinerary, step by step.
 *
 * No card chrome of its own: it is rendered inside the option it belongs to, and a
 * card drawn inside a card reads as two separate things when it is meant to read as
 * one continuous one.
 */
export function ItineraryDetails({
  itinerary,
  heading = true,
}: {
  itinerary: Itinerary;
  // False where the disclosure that opens this panel already carries the words "Step
  // by step" (the phone tier in ResultsPanel): the same heading drawn twice reads as
  // two panels, and is announced twice.
  heading?: boolean;
}) {
  const { lang, t } = useI18n();
  return (
    <div data-fov="itinerary" className="mt-3">
      <div className="mb-3 flex items-baseline justify-between">
        {heading && <h4 className="font-semibold dark:text-night-text">{t("stepByStep")}</h4>}
        <span className={`text-sm text-gray-500 dark:text-night-subtle ${heading ? "" : "ml-auto"}`}>
          {hhmm(itinerary.start_time)} – {hhmm(itinerary.end_time)} · {itinerary.minutes} min
        </span>
      </div>
      <ol className="space-y-3">
        {itinerary.legs.map((leg, i) => (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              {/* Chip colour matches the leg's line colour on the map (lib/modeColors);
                  the ink is whichever of near-black and white that fill can carry. */}
              <span
                data-fov="leg-chip"
                className="flex h-7 min-w-[2rem] items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-semibold"
                style={{ backgroundColor: modeColor(leg.mode), color: chipInk(modeColor(leg.mode)) }}
              >
                {legTitle(leg, lang)}
              </span>
              {i < itinerary.legs.length - 1 && (
                <span className="my-1 w-px flex-1 bg-gray-200 dark:bg-night-border" />
              )}
            </div>
            <div className="pb-1">
              <p className="text-sm font-medium dark:text-night-text">
                {leg.from.name || t("start")} <span className="text-gray-400 dark:text-night-faint">→</span>{" "}
                {leg.to.name || t("destination")}
              </p>
              <p className="text-xs text-gray-500 dark:text-night-subtle">
                {hhmm(leg.start_time)}–{hhmm(leg.end_time)} · {leg.minutes} min
                {leg.distance_m != null && ` · ${Math.round(leg.distance_m)} m`}
                {leg.headsign && ` · ${t("towardsX", { x: leg.headsign })}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <MetricNotes itinerary={itinerary} />
    </div>
  );
}

// The modes the zero-CO2 note is actually about. A bike-only itinerary also totals
// zero, but explaining that with a sentence about green traction current would be a
// non sequitur, so the note waits for a leg it describes.
const GREEN_TRACTION_MODES = new Set(["TRAM", "SUBWAY", "METRO"]);

// The cards compare four figures in three words each. None of them is a quote, a
// measurement or a promise, so the assumptions behind them are stated in full once,
// here, under the itinerary they belong to.
function MetricNotes({ itinerary }: { itinerary: Itinerary }) {
  const { t } = useI18n();
  const { fareEur, co2Complete, co2Grams } = tripMetrics(itinerary);
  // Only raise a caveat when this particular itinerary actually earns it.
  const straightLine = itinerary.legs.some((l) => l.distance_m == null && legDistanceM(l) != null);
  const greenTraction = itinerary.legs.some((l) => GREEN_TRACTION_MODES.has(l.mode));
  return (
    <details className="group mt-3 border-t border-gray-100 dark:border-white/10">
      {/* A 44px row, not a 16px line of text. `list-none` plus the webkit rule drops
          the native triangle so the chevron can carry the state instead; the rotation
          is motion-safe, like every other transition in the app. */}
      <summary
        data-fov="estimates-toggle"
        className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-night-subtle [&::-webkit-details-marker]:hidden"
      >
        {/* An inline chevron rather than a font glyph: the icon font is subset from the
            list in index.css and a new ligature there means regenerating the .woff2. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 motion-safe:transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        {t("estimatesTitle")}
      </summary>
      <ul className="mb-2 space-y-1.5 text-xs leading-snug text-gray-500 dark:text-night-subtle">
        <li>{fareEur == null ? t("estimatesNoFare") : t("estimatesFare")}</li>
        <li>{t("estimatesKcal", { kg: DEFAULT_BODY_MASS_KG })}</li>
        <li>{t("estimatesCo2")}</li>
        {co2Grams === 0 && co2Complete && greenTraction && <li>{t("estimatesCo2Zero")}</li>}
        {!co2Complete && <li>{t("estimatesCo2Incomplete")}</li>}
        {straightLine && <li>{t("estimatesStraightLine")}</li>}
      </ul>
    </details>
  );
}
