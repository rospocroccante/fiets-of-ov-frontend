import { useEffect, useState } from "react";
import type { Mode } from "../api/types";
import { useI18n } from "../lib/i18n";
import { departureLabel } from "../lib/planView";
import type { OptionView, PlanView } from "../lib/planView";
import { AdviceCard } from "./AdviceCard";
import { ItineraryDetails } from "./ItineraryDetails";

export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; view: PlanView; selectedMode: Mode; onSelect: (mode: Mode) => void };

// A clock the panel can render from. Reading Date.now() during render makes the render
// impure and, worse, freezes it: the panel stays mounted for the whole session, so
// "Leave now" would keep insisting on a departure that left twenty minutes ago. Half a
// minute is finer than the label's own resolution and costs one re-render per tick.
const TICK_MS = 30_000;

function useNow(periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

function WeatherBanner({ view }: { view: PlanView }) {
  const { t } = useI18n();
  const wet = view.rainExpected === true;
  const unknown = view.rainExpected === null;
  const tone = wet
    ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/25 dark:text-amber-200 dark:border-amber-800/40"
    : unknown
      ? "bg-gray-50 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-night-muted dark:border-white/10"
      : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-night-accent-deep/25 dark:text-night-accent-soft dark:border-night-accent-deep/40";
  const tag = wet ? t("rainExpected") : unknown ? t("forecastUnavailable") : t("dry");
  return (
    <div data-fov="weather-banner" className={`rounded-card border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">{tag}</span>
        {view.maxRain != null && view.maxRain > 0 && (
          <span className="text-xs">{t("upToMmH", { x: view.maxRain })}</span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium">{view.reason}</p>
    </div>
  );
}

// The chevron that carries a disclosure's state. Inline rather than a font glyph: the
// icon font is subset from the list in index.css and a new ligature there means
// regenerating the .woff2. Motion-safe, like every other transition in the app.
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 motion-safe:transition-transform group-open/steps:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ResultsPanel({
  state,
  onStartNav,
  narrow = false,
}: {
  state: PanelState;
  // Starts turn-by-turn navigation for the selected option; the button only renders
  // when the app can actually navigate (a route exists), so the prop is optional.
  onStartNav?: () => void;
  // The phone tier: the results column is the bottom ~30% of the screen rather than
  // half the window, and two things move because of it. The advice banner goes under
  // the options instead of over them, and the chosen option's steps start folded. Both
  // are about what is on screen when the plan lands — see the comments where they are
  // used. App decides this on the same query that decides the rest of the phone layout.
  narrow?: boolean;
}) {
  const { t } = useI18n();
  const now = useNow(TICK_MS);
  if (state.status === "idle") {
    return (
      <div className="p-6 text-gray-500 dark:text-night-subtle">{t("idlePrompt")}</div>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="space-y-4 p-2">
        <div className="h-20 animate-pulse rounded-card bg-gray-100 dark:bg-white/10" />
        <div className="h-40 animate-pulse rounded-card bg-gray-100 dark:bg-white/10" />
        <div className="h-56 animate-pulse rounded-card bg-gray-100 dark:bg-white/10" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="m-2 rounded-card border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        {state.message}
      </div>
    );
  }

  const { view, selectedMode, onSelect } = state;
  const selected = view.options.find((o) => o.mode === selectedMode) ?? view.options[0];

  // All options can be filtered away by the mode chips; say so instead of crashing.
  if (!selected) {
    return (
      <div className="m-2 rounded-card border border-gray-100 bg-white p-4 text-sm text-gray-500 dark:border-white/10 dark:bg-night-surface dark:text-night-subtle">
        {t("noOptionsMatch")}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2">
      {/* On anything wider than a phone the banner leads: there is room for the advice
          and the options at once. On a phone there is not — the strip and this banner
          were 219.5px of a 272px column, which left 52.9px of one option row visible
          when the plan landed and none of the other two. The banner is the sentence
          behind the "Best" badge the first row already carries, so on a phone it reads
          after the options rather than instead of them. Nothing is dropped. */}
      {!narrow && <WeatherBanner view={view} />}
      {/* The options, stacked. Each one is a full-width row, and the selected row and
          the itinerary it opens are one bordered block rather than a card above a list
          somewhere below it: choosing an option and reading it are the same place.
          Nothing here scrolls sideways — the three 120px cards in an `overflow-x-auto`
          row that came before put the third one 64px past the clip on a 360px phone,
          where a tap at its centre reached the panel behind it. */}
      <ul data-fov="option-list" aria-label={t("travelOptions")} className="space-y-2">
        {view.options.map((option) => {
          const isSelected = option.mode === selected.mode;
          const detailsId = `fov-option-${option.mode}`;
          return (
            <li
              key={option.mode}
              data-fov="option"
              data-selected={isSelected ? "true" : "false"}
              // No fill on the selected block: the accent ring and the open itinerary
              // are what mark it, so the text on the option the user chose keeps the
              // same contrast as the text on the ones they did not.
              className={`overflow-hidden rounded-card border bg-white transition dark:bg-night-surface ${
                isSelected
                  ? "border-brand ring-1 ring-inset ring-brand dark:border-night-accent dark:ring-night-accent"
                  : "border-gray-200 hover:border-gray-300 dark:border-night-border dark:hover:border-white/25"
              }`}
            >
              <AdviceCard
                option={option}
                selected={isSelected}
                onSelect={() => onSelect(option.mode)}
                detailsId={detailsId}
              />
              {isSelected && (
                <SelectedDetails
                  id={detailsId}
                  option={option}
                  now={now}
                  narrow={narrow}
                  onStartNav={onStartNav}
                />
              )}
            </li>
          );
        })}
      </ul>
      {narrow && <WeatherBanner view={view} />}
    </div>
  );
}

/**
 * What the chosen option opens: when it leaves, how to start it, and the steps.
 *
 * On a phone the steps start folded. Open, they are 372px of an itinerary sitting
 * between option 1 and option 2, which is why comparing three options used to mean
 * scrolling 416px to reach the second one and 513px to reach the third. Folded, the
 * chosen option costs 66px instead of 372 and the list stays a list. This is still one
 * block with the row above it — same box, same border, the disclosure inside it — and
 * on anything wider the panel is open, exactly as it was.
 */
function SelectedDetails({
  id,
  option,
  now,
  narrow,
  onStartNav,
}: {
  id: string;
  option: OptionView;
  now: number;
  narrow: boolean;
  onStartNav?: () => void;
}) {
  const { lang, t } = useI18n();
  const departure = departureLabel(option.itinerary, now, lang);
  const start = onStartNav ? (
    <button
      type="button"
      aria-label={t("startNavigation")}
      onClick={onStartNav}
      className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-brand px-4 text-xs font-semibold text-white shadow transition hover:brightness-110 dark:bg-night-accent dark:text-night-bg"
    >
      {t("start")}
    </button>
  ) : null;
  return (
    <div
      id={id}
      data-fov="option-details"
      className="border-t border-gray-100 px-3 pb-3 pt-2.5 dark:border-white/10"
    >
      {narrow ? (
        // A named group, not the bare `group` the estimates note uses: nested groups
        // both answer to `group-open:`, and the note's own chevron would turn when
        // this one opened. The 44px row is the departure line doing double duty — it
        // has to be on screen anyway, and a chevron beside it is what says the steps
        // are under it.
        <details className="group/steps" data-fov="option-steps">
          <summary
            data-fov="steps-toggle"
            className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
          >
            <Chevron />
            <span
              data-fov="departure"
              className="min-w-0 flex-1 truncate text-sm font-medium text-gray-600 dark:text-night-muted"
            >
              {departure}
            </span>
            <span className="shrink-0 text-xs font-semibold text-brand dark:text-night-accent">
              {t("stepByStep")}
            </span>
          </summary>
          {start && <div className="mt-2 flex">{start}</div>}
          {/* The summary above already names the steps; a second identical heading
              inside would be read out twice and drawn twice. */}
          <ItineraryDetails itinerary={option.itinerary} heading={false} />
        </details>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p
              data-fov="departure"
              className="min-w-0 flex-1 text-sm font-medium text-gray-600 dark:text-night-muted"
            >
              {departure}
            </p>
            {start}
          </div>
          <ItineraryDetails itinerary={option.itinerary} />
        </>
      )}
    </div>
  );
}
