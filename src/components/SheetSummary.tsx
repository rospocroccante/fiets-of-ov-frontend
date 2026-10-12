import type { Mode } from "../api/types";
import { useI18n } from "../lib/i18n";
import { chipInk, modeColor } from "../lib/modeColors";
import { ModeIcon } from "./icons/ModeIcon";
import { WeatherVerdict, type PanelState } from "./ResultsPanel";

// The phone results sheet's header: everything the collapsed sheet shows, and the top of
// the sheet at every other height. It answers the trip on its own, the way Google Maps'
// collapsed directions do: the chosen option with its minutes, the weather's verdict, a
// Start, and the other option one tap away. The list, the steps and the forecast are
// under it, in the sheet's content.
//
// It shows the chosen option, which is the recommended one until the rider picks
// another: Start navigates the chosen route, so a header about any other option would
// start a trip it does not name.
//
// While a ride is on it is that ride's summary and nothing more: no Start, no other
// option, no Try again; the banner's Exit ends the ride. The route being ridden is the
// chosen option's, so a tap that chose another one mid-ride swapped the route under the
// rider, rebuilt from the itinerary's start rather than from where they were.
//
// Idle has no sheet at all, so it renders nothing. Loading, error and every option
// filtered away are this header alone, and the sheet hugs it. A plan with options, even
// one, has content under the header and does not.

// The leg colour each option's badge is filled with: the colour its main leg has on the
// map and on the step chips.
const BADGE_LEG: Record<Mode, string> = { bike: "BICYCLE", transit: "TRAM", bike_and_ride: "BICYCLE" };

const BOX = "px-4 pb-3";
// The same filled pill as the results panel's Start, a little wider.
const PRIMARY =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition hover:brightness-110 dark:bg-night-accent dark:text-night-bg";
const SECONDARY =
  "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-300 px-4 text-sm font-semibold tabular-nums text-slate-800 transition-colors hover:bg-slate-900/5 dark:border-night-rim/40 dark:text-night-text dark:hover:bg-night-hover/60";

export function SheetSummary({
  state,
  onStartNav,
  onRetry,
  navigating = false,
}: {
  state: PanelState;
  // The results panel's Start: navigation for the chosen option. Absent when there is no
  // route to navigate.
  onStartNav?: () => void;
  // Runs the same search again.
  onRetry: () => void;
  // A ride is on: the header shows the trip and offers nothing that would change it.
  navigating?: boolean;
}) {
  const { t } = useI18n();
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    // The placeholder row stands where the buttons will be, so the header grows by the
    // title row when the plan lands and nothing else moves. It pulses only where motion
    // is allowed; the global reduced-motion rule in index.css stops it as well.
    return (
      <div data-fov="sheet-summary" aria-busy="true" className={BOX}>
        <p className="text-[15px] font-semibold text-slate-900 dark:text-night-text">{t("planningTrip")}</p>
        <div data-fov="summary-placeholder" aria-hidden="true" className="mt-3 flex gap-2">
          <span className="h-11 flex-1 rounded-full bg-slate-100 motion-safe:animate-pulse dark:bg-night-raised" />
          <span className="h-11 w-24 rounded-full bg-slate-100 motion-safe:animate-pulse dark:bg-night-raised" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    // The backend's own message stays out: it is written for whoever runs the backend.
    // The desktop results column still shows it, unchanged.
    return (
      <div data-fov="sheet-summary" className={BOX}>
        <p className="text-[15px] font-medium text-slate-900 dark:text-night-text">{t("routesUnavailable")}</p>
        {!navigating && (
          <div className="mt-3 flex">
            <button type="button" data-fov="summary-retry" onClick={onRetry} className={PRIMARY}>
              {t("tryAgain")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const { view, selectedMode, onSelect } = state;
  const chosen = view.options.find((o) => o.mode === selectedMode) ?? view.options[0];
  if (!chosen) {
    return (
      <div data-fov="sheet-summary" className={BOX}>
        <p className="text-sm text-slate-600 dark:text-night-muted">{t("noOptionsMatch")}</p>
      </div>
    );
  }
  // The best-ranked option that is not the chosen one: the backend sends them ranked.
  // Neither it nor the Start is offered during a ride.
  const other = navigating ? undefined : view.options.find((o) => o.mode !== chosen.mode);
  const start = navigating ? undefined : onStartNav;
  const fill = modeColor(BADGE_LEG[chosen.mode]);
  return (
    <div data-fov="sheet-summary" className={BOX}>
      <div className="flex items-start gap-3">
        <span
          data-fov="summary-mode"
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: fill, color: chipInk(fill) }}
        >
          <ModeIcon mode={chosen.mode} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                data-fov="summary-title"
                className="min-w-0 text-[15px] font-semibold text-slate-900 dark:text-night-text"
              >
                {chosen.title}
              </span>
              {chosen.recommended && (
                // The option row's tag, the same at night: geel ground, navy type.
                <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-emerald-700 dark:bg-night-accent dark:text-night-bg">
                  {t("best")}
                </span>
              )}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xl font-bold leading-7 tabular-nums text-slate-900 dark:text-night-text">
              {chosen.minutes} min
            </span>
          </div>
          <WeatherVerdict view={view} className="mt-1" />
        </div>
      </div>
      {(start || other) && (
        <div className="mt-3 flex gap-2">
          {start && (
            <button
              type="button"
              data-fov="summary-start"
              aria-label={t("startNavigation")}
              onClick={start}
              className={`${PRIMARY} flex-1`}
            >
              {t("start")}
            </button>
          )}
          {other && (
            <button
              type="button"
              data-fov="summary-alt"
              aria-label={`${other.title}, ${other.minutes} min`}
              onClick={() => onSelect(other.mode)}
              className={SECONDARY}
            >
              <ModeIcon mode={other.mode} className="h-4 w-4" />
              {other.minutes} min
            </button>
          )}
        </div>
      )}
    </div>
  );
}
