import { useI18n } from "../lib/i18n";
import type { Lang, Translator } from "../lib/i18n";
import { modeColor } from "../lib/modeColors";
import type { OptionView } from "../lib/planView";

// The advice option maps to a transport mode for its accent dot.
const OPTION_MODE: Record<OptionView["mode"], string> = {
  bike: "BICYCLE",
  transit: "SUBWAY",
  bike_and_ride: "FERRY",
};

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
 * Selection is drawn by the caller (the accent ring, and the itinerary that opens
 * underneath): this button paints no background of its own, so its text keeps the same
 * contrast selected or not. The old selected state filled the row with `bg-emerald-600`
 * in the night theme and put `text-white/85` on it — 3.14:1, the least legible text on
 * the screen, on the option the user had actually chosen.
 */
export function AdviceCard({
  option,
  selected,
  onSelect,
  detailsId,
}: {
  option: OptionView;
  selected: boolean;
  onSelect: () => void;
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
      aria-pressed={selected}
      // The row is also the disclosure for its own itinerary, so it says so. Both
      // states are true of the same control: it selects the option and it opens it.
      aria-expanded={selected}
      aria-controls={selected ? detailsId : undefined}
      data-fov="option-button"
      className="flex min-h-[44px] w-full flex-col gap-1 px-3 py-2.5 text-left transition"
    >
      <span className="flex w-full items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: modeColor(OPTION_MODE[option.mode]) }}
        />
        {/* No truncate. The row is as wide as the column, which is the whole point of
            the shape: "Openbaar vervoer" fits, and anything longer wraps rather than
            losing the word that says which option this is. */}
        <h3
          data-fov="option-title"
          className={`min-w-0 flex-1 text-sm font-semibold ${
            selected ? "text-brand dark:text-emerald-300" : "text-slate-900 dark:text-night-text"
          }`}
        >
          {option.title}
        </h3>
        {option.recommended && (
          // One treatment, selected or not. The selected variant used to be
          // white-on-brand at 10px, which measured 2.86:1 in the night theme.
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {t("best")}
          </span>
        )}
      </span>
      {/* Minutes lead, the route reads after them. flex-wrap, so a long summary drops
          to its own line instead of pushing the minutes onto two ("28" over "min",
          which is what the Best badge used to do to the recommended row). */}
      <span className="flex w-full flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-bold leading-tight text-slate-900 dark:text-night-text">
          {option.minutes} min
        </span>
        <span data-fov="option-summary" className={`text-xs ${secondary}`}>
          {option.summary}
        </span>
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
