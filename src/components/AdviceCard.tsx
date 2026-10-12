import type { PlanLeg } from "../api/types";
import { translate, useI18n } from "../lib/i18n";
import type { Lang, Translator } from "../lib/i18n";
import { chipInk, modeColor } from "../lib/modeColors";
import { transitLabel } from "../lib/planView";
import type { OptionView } from "../lib/planView";

function euros(amount: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "nl" ? "nl-NL" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

// Visible text plus the accessible name for it. The two differ on purpose: the row
// has room for "= 2.34" and a screen reader needs "Estimated fare 2.34 euros".
interface Metric {
  text: string;
  label: string;
}

function fareMetric(fareEur: number | null, t: Translator, lang: Lang): Metric {
  if (fareEur == null) {
    return { text: t("fareNoEstimate"), label: t("a11yFareNoEstimate") };
  }
  if (fareEur === 0) return { text: t("fareFree"), label: t("a11yFareFree") };
  const x = euros(fareEur, lang);
  return { text: t("fareApprox", { x }), label: t("a11yFareApprox", { x }) };
}

// The CO2 total, with a floor mark when it is one.
//
// tripMetrics reports co2Complete = false when a leg has no published emission factor
// (the IJ ferry is the live case: no Dutch source publishes a figure for a city ferry),
// which leaves that leg out of the sum. The row used to print "0 g CO2" for that trip
// in exactly the same words as a trip whose total really is zero. The "≥" says the
// number is a floor; the full sentence is in the estimates note under the itinerary.
function co2Metric(grams: number, complete: boolean, t: Translator): Metric {
  if (complete) {
    return { text: t("co2Value", { n: grams }), label: t("a11yCo2", { n: grams }) };
  }
  return { text: t("co2AtLeast", { n: grams }), label: t("a11yCo2AtLeast", { n: grams }) };
}

function rainMetric(rainMinutes: number | null, t: Translator): Metric {
  if (rainMinutes == null) return { text: t("rainUnknown"), label: t("a11yRainUnknown") };
  if (rainMinutes <= 0) return { text: t("noRain"), label: t("a11yNoRain") };
  const n = Math.round(rainMinutes);
  return { text: t("rainMinutesValue", { n }), label: t("a11yRainMinutes", { n }) };
}

// The short name a duration-bar segment carries: the mode or the line, then its
// minutes. Metro lines go by their GVB letter ("M52"), other lines by mode and number
// ("Tram 1"), and a walk is minutes alone, because a grey stretch between two coloured
// ones already says what it is. A middle dot between name and minutes keeps "Tram 1 · 9"
// from reading as "Tram 19".
const LEG_SEP = "\u2009\u00b7\u2009";
function legBarLabel(leg: PlanLeg, lang: Lang): string {
  if (leg.mode === "WALK") return `${leg.minutes}`;
  if (leg.mode === "BICYCLE") return `${translate(lang, "bike")}${LEG_SEP}${leg.minutes}`;
  const metro = leg.mode === "SUBWAY" || leg.mode === "METRO";
  const line = leg.route
    ? metro
      ? `M${leg.route}`
      : `${transitLabel(leg.mode, lang)} ${leg.route}`
    : transitLabel(leg.mode, lang);
  return `${line}${LEG_SEP}${leg.minutes}`;
}

/**
 * The option's legs as one bar, each segment as wide as its share of the minutes and
 * filled with the colour that leg has on the map and on its step-by-step chip.
 *
 * Decoration that carries the route: a rider sees six minutes of bike and seven of
 * metro before reading a word. It is aria-hidden because the option's summary already
 * says the same thing in a sentence, and that summary stays in the row for assistive
 * tech.
 *
 * A label that does not fit disappears whole, so the clip never shows a fragment such
 * as "Tra". Each segment is a one-line wrapping flex row with a zero-width strut as tall
 * as the bar: the label either fits on the strut's line or wraps to a second one, which
 * overflow clips away. Pure CSS, so it holds through every resize without measuring
 * anything. The 4px floor keeps a zero-minute transfer visible as colour.
 */
function LegBar({ legs }: { legs: PlanLeg[] }) {
  const { lang } = useI18n();
  if (legs.length === 0) return null;
  return (
    <span aria-hidden="true" data-fov="leg-bar" className="mt-2 mb-1.5 flex h-[22px] w-full gap-[3px]">
      {legs.map((leg, i) => {
        const fill = modeColor(leg.mode);
        return (
          <span
            key={i}
            data-fov="leg-segment"
            className="flex h-[22px] min-w-[4px] basis-0 flex-wrap items-center overflow-hidden rounded-[5px]"
            style={{ flexGrow: Math.max(0, leg.minutes), backgroundColor: fill, color: chipInk(fill) }}
          >
            <span className="h-[22px] w-0" />
            <span className="whitespace-nowrap px-1.5 text-[11px] font-bold leading-none">
              {legBarLabel(leg, lang)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * One travel option, as a full-width row.
 *
 * It used to be a 120px card in a horizontal scroller, three abreast. That shape cost
 * the screen three separate defects at once: on a 360px phone the third card started
 * 64px past the row's clip, so a finger aimed at its middle reached the results panel
 * behind it; the four figures stacked one per line made the card 194.5px tall, more
 * than the whole visible results column in landscape; and 80px of title clipped
 * "Openbaar vervoer" to "Openbaar ver...".
 *
 * A row fixes all three by having width to spend. Nothing scrolls sideways, the title
 * is never cut, and the four figures sit on one wrapping line instead of four stacked
 * ones. The comparison is still the four figures — same numbers, same meaning — only
 * laid out along the row rather than down it.
 *
 * The header reads like a departure board line: the option on the left, its total time
 * large on the right, the leg bar under both. The written route ("Bike 6 min -> Metro
 * 52") is what the bar draws, so on screen the bar replaces it and the sentence stays
 * in the row, visually hidden, for a screen reader.
 *
 * Selection is drawn by the caller (a flat tint with an accent bar on its left edge,
 * and the itinerary that opens underneath): this button paints no background of its
 * own when chosen, so its text is measured against the caller's tint and nothing else.
 * The old selected state filled the row with `bg-emerald-600` in the night theme and
 * put `text-white/85` on it: 3.14:1, the least legible text on the screen, on the
 * option the user had actually chosen.
 */
export function AdviceCard({
  option,
  selected,
  onSelect,
  detailsId,
}: {
  option: OptionView;
  selected: boolean;
  // Absent while a ride is on: the row is disabled, and says the same as ever.
  onSelect?: () => void;
  // The panel this row expands to, when it is the selected one.
  detailsId?: string;
}) {
  const { lang, t } = useI18n();
  const { fareEur, kcal, co2Grams, co2Complete } = option.metrics;
  const metrics: Metric[] = [
    fareMetric(fareEur, t, lang),
    { text: t("kcalValue", { n: kcal }), label: t("a11yKcal", { n: kcal }) },
    co2Metric(co2Grams, co2Complete, t),
    rainMetric(option.rainMinutes, t),
  ];
  const secondary = selected
    ? "text-slate-600 dark:text-night-muted"
    : "text-slate-500 dark:text-night-subtle";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      aria-pressed={selected}
      // The row is also the disclosure for its own itinerary, so it says so. Both
      // states are true of the same control: it selects the option and it opens it.
      aria-expanded={selected}
      aria-controls={selected ? detailsId : undefined}
      data-fov="option-button"
      // A row that is not chosen answers a pointer with a flat tint and nothing else:
      // no lift, no shadow. The chosen one already carries the caller's tint, and a row
      // that cannot be chosen answers nothing.
      className={`flex min-h-[44px] w-full flex-col rounded-card px-3 py-3 text-left transition-colors disabled:cursor-default ${
        selected || !onSelect ? "" : "hover:bg-slate-900/5 dark:hover:bg-night-hover/60"
      }`}
    >
      <span className="flex w-full items-baseline gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {/* No truncate. The row is as wide as the column, which is the whole point
              of the shape: "Openbaar vervoer" fits, and anything longer wraps rather
              than losing the word that says which option this is. */}
          <h3
            data-fov="option-title"
            className={`min-w-0 text-[15px] font-semibold ${
              selected ? "text-brand dark:text-night-accent" : "text-slate-900 dark:text-night-text"
            }`}
          >
            {option.title}
          </h3>
          {option.recommended && (
            // A 6px tag; pills are kept for controls. At night it is the signage
            // pairing, geel ground and navy type (10.92:1): the translucent
            // accent-deep it had before composited to olive on the navy page.
            <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-emerald-700 dark:bg-night-accent dark:text-night-bg">
              {t("best")}
            </span>
          )}
        </span>
        {/* The total, large, because it is the number the three rows are compared on.
            nowrap, so the Best tag can never push "28" over "min". */}
        <span className="shrink-0 whitespace-nowrap text-xl font-bold leading-7 tabular-nums text-slate-900 dark:text-night-text">
          {option.minutes} min
        </span>
      </span>
      <LegBar legs={option.itinerary.legs} />
      {/* The route in words. Where the bar draws it, this is for a screen reader only;
          an itinerary with no legs to draw keeps it on screen. */}
      <span
        data-fov="option-summary"
        className={`${option.itinerary.legs.length > 0 ? "sr-only" : "text-xs"} ${secondary}`}
      >
        {option.summary}
      </span>
      {/* One step darker on the chosen row. Its four figures are the ones the user
          actually reads, and they used to be the least legible text on the screen. */}
      <ul
        data-fov="option-metrics"
        className={`flex w-full flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums ${secondary}`}
      >
        {metrics.map((m, i) => (
          <li key={m.label} aria-label={m.label} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-gray-300 dark:text-night-faint">
                &middot;
              </span>
            )}
            {m.text}
          </li>
        ))}
      </ul>
    </button>
  );
}
