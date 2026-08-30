import { useShortForecast } from "../hooks/useShortForecast";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useI18n } from "../lib/i18n";
import { weatherLook } from "../lib/weatherIcons";

function Glyph({ icon, className, px }: { icon: string; className?: string; px?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-rounded leading-none ${className ?? ""}`}
      // font-size inline rather than as a class: `.material-symbols-rounded` in
      // index.css sets 24px and wins against a `text-[16px]` utility, so a class here
      // is silently ignored. Only the compact tier passes a size; everything else keeps
      // the 24px it has always actually rendered at.
      style={{ fontVariationSettings: "'FILL' 1", ...(px != null ? { fontSize: `${px}px` } : {}) }}
    >
      {icon}
    </span>
  );
}

// The phone tier. The strip sits above the option rows in a results column that is
// 246px tall on a 360x800 phone, and at its full height it took 85.5px of that before
// the banner took another 102 — which left 26.5px of one option row on screen when the
// plan landed, and nothing of the other two. Compact keeps every hour and every figure
// and spends the pixels differently: the condition word moves to the accessible name
// (the temperature and the icon carry it visually), the glyphs come down a size and
// every line loses its leading. Nothing is removed, and above `sm` nothing changes.

// How many of the ten forecast slots the strip shows.
//
// It used to render all ten inside an `overflow-x-auto` box with no scroll affordance:
// at 390 wide that was 556px of content in 356px of strip, so 200px of it — four whole
// hours — was hidden behind an edge nothing suggested you could drag. Content that is
// not reachable is not shown, so the strip now renders what it has room for. The
// results column is half the window from `md` up, which is why the wide tier waits for
// `lg` rather than following the layout breakpoint.
const HOURS_NARROW = 4;
const HOURS_WIDE = 6;

// Compact now-plus-next-hours weather readout for the results column: the advice
// banner says WHAT to do, this shows the sky it was decided on. Hidden entirely
// while loading or when the feed fails (the advice text still carries the answer).
export function WeatherStrip({
  lat,
  lon,
  compact = false,
}: {
  lat: number;
  lon: number;
  // The phone tier (see above). App decides it, on the same query that decides the
  // rest of the phone layout, so the strip and the column it sits in never disagree.
  compact?: boolean;
}) {
  const { lang } = useI18n();
  const { forecast } = useShortForecast(lat, lon);
  const roomy = useMediaQuery("(min-width: 1024px)");
  if (!forecast) return null;
  const now = weatherLook(forecast.current.code, forecast.current.isDay, lang);
  const hours = forecast.hours.slice(0, roomy ? HOURS_WIDE : HOURS_NARROW);
  return (
    <div
      data-fov="weather-strip"
      className={`flex items-center rounded-card border border-slate-100 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-night-surface/80 ${
        compact ? "mb-2 gap-3 px-3 py-1.5" : "mb-3 gap-4 px-4 py-3"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2" title={now.label}>
        <Glyph icon={now.icon} px={compact ? 22 : undefined} className="text-ams-sky dark:text-ams-ns" />
        <div>
          <p
            className={`font-semibold leading-tight dark:text-night-text ${compact ? "text-base" : "text-lg"}`}
          >
            {forecast.current.tempC}&deg;
          </p>
          {/* The condition in words. Compact has no room for it beside the option rows,
              so it stops being drawn and stays readable: the title attribute above and
              this line still name it, and sr-only is in the accessibility tree. */}
          <p
            className={`text-[11px] leading-tight text-gray-500 dark:text-night-subtle ${
              compact ? "sr-only" : ""
            }`}
          >
            {now.label}
          </p>
        </div>
      </div>
      <span className={`w-px shrink-0 bg-slate-100 dark:bg-night-border ${compact ? "h-6" : "h-8"}`} />
      <ol data-fov="weather-hours" className="flex min-w-0 flex-1 items-center justify-between gap-2">
        {hours.map((h) => {
          const look = weatherLook(h.code, true, lang);
          const temp = (
            <span
              className={`text-[11px] font-semibold text-gray-700 dark:text-night-text ${
                compact ? "leading-none" : ""
              }`}
            >
              {h.tempC}&deg;
            </span>
          );
          const precip =
            h.precipProb >= 20 ? (
              // sky-600 was 4.1:1 on white and 3.21:1 on the night surface. The rain
              // percentage is the one figure on this strip a decision hangs on.
              <span
                className={`text-[10px] font-medium text-sky-800 dark:text-sky-300 ${
                  compact ? "leading-none" : ""
                }`}
              >
                {h.precipProb}%
              </span>
            ) : null;
          return (
            <li key={h.time} className="flex min-w-0 flex-col items-center" title={look.label}>
              {/* slate-500, not gray-400: the hour labels measured 2.54:1 on white. */}
              <span
                className={`text-[10px] font-medium text-slate-500 dark:text-night-subtle ${
                  compact ? "leading-none" : ""
                }`}
              >
                {h.time}
              </span>
              <Glyph icon={look.icon} px={compact ? 16 : undefined} className="my-0.5 text-ams-sky dark:text-ams-ns" />
              {/* Compact puts the rain chance beside the temperature rather than under
                  it, so a wet hour and a dry one are the same height and the column
                  below the strip does not lose a row the moment it starts raining. */}
              {compact ? (
                <span className="flex items-baseline gap-1 leading-none">
                  {temp}
                  {precip}
                </span>
              ) : (
                <>
                  {temp}
                  {precip}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
