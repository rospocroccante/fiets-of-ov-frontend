import type { Mode } from "../api/types";
import { useI18n } from "../lib/i18n";
import { departureLabel } from "../lib/planView";
import type { PlanView } from "../lib/planView";
import { AdviceCard } from "./AdviceCard";
import { ItineraryDetails } from "./ItineraryDetails";

export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; view: PlanView; selectedMode: Mode; onSelect: (mode: Mode) => void };

function WeatherBanner({ view }: { view: PlanView }) {
  const { t } = useI18n();
  const wet = view.rainExpected === true;
  const unknown = view.rainExpected === null;
  const tone = wet
    ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/25 dark:text-amber-200 dark:border-amber-800/40"
    : unknown
      ? "bg-gray-50 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10"
      : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-800/40";
  const tag = wet ? t("rainExpected") : unknown ? t("forecastUnavailable") : t("dry");
  return (
    <div className={`rounded-card border p-4 ${tone}`}>
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

export function ResultsPanel({
  state,
  onStartNav,
}: {
  state: PanelState;
  // Starts turn-by-turn navigation for the selected option; the button only renders
  // when the app can actually navigate (a route exists), so the prop is optional.
  onStartNav?: () => void;
}) {
  const { lang, t } = useI18n();
  if (state.status === "idle") {
    return (
      <div className="p-6 text-gray-500 dark:text-slate-400">{t("idlePrompt")}</div>
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
      <div className="m-2 rounded-card border border-gray-100 bg-white p-4 text-sm text-gray-500 dark:border-white/10 dark:bg-[#2A2F34] dark:text-slate-400">
        {t("noOptionsMatch")}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2">
      <WeatherBanner view={view} />
      {/* Compact mode toggles in one row; the itinerary below is the main content. */}
      <div className="flex gap-2 overflow-x-auto">
        {view.options.map((option) => (
          <AdviceCard
            key={option.mode}
            option={option}
            selected={option.mode === selected.mode}
            onSelect={() => onSelect(option.mode)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 px-1">
        <p className="min-w-0 flex-1 text-sm text-gray-500 dark:text-slate-400">
          {selected.summary}
          <span className="px-1.5 text-gray-300 dark:text-slate-600">&middot;</span>
          <span className="font-medium text-gray-600 dark:text-slate-300">
            {departureLabel(selected.itinerary, Date.now(), lang)}
          </span>
        </p>
        {onStartNav && (
          <button
            type="button"
            aria-label={t("startNavigation")}
            onClick={onStartNav}
            className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:brightness-110 dark:bg-emerald-600"
          >
            {t("start")}
          </button>
        )}
      </div>
      <ItineraryDetails itinerary={selected.itinerary} />
    </div>
  );
}
