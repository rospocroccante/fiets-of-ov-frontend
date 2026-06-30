import type { Mode } from "../api/types";
import type { PlanView } from "../lib/planView";
import { AdviceCard } from "./AdviceCard";
import { ItineraryDetails } from "./ItineraryDetails";

export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; view: PlanView; selectedMode: Mode; onSelect: (mode: Mode) => void };

function WeatherBanner({ view }: { view: PlanView }) {
  const wet = view.rainExpected === true;
  const unknown = view.rainExpected === null;
  const tone = wet
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : unknown
      ? "bg-gray-50 text-gray-600 border-gray-200"
      : "bg-emerald-50 text-emerald-800 border-emerald-200";
  const tag = wet ? "Rain expected" : unknown ? "Forecast unavailable" : "Dry";
  return (
    <div className={`rounded-card border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">{tag}</span>
        {view.maxRain != null && view.maxRain > 0 && (
          <span className="text-xs">peak ~{view.maxRain} mm/h</span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium">{view.reason}</p>
    </div>
  );
}

export function ResultsPanel({ state }: { state: PanelState }) {
  if (state.status === "idle") {
    return (
      <div className="p-6 text-gray-500">
        Enter origin and destination to see the bike-or-transit advice.
      </div>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="space-y-4 p-2">
        <div className="h-20 animate-pulse rounded-card bg-gray-100" />
        <div className="h-40 animate-pulse rounded-card bg-gray-100" />
        <div className="h-56 animate-pulse rounded-card bg-gray-100" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="m-2 rounded-card border border-red-200 bg-red-50 p-4 text-red-700">
        {state.message}
      </div>
    );
  }

  const { view, selectedMode, onSelect } = state;
  const selected = view.options.find((o) => o.mode === selectedMode) ?? view.options[0];

  return (
    <div className="space-y-4 p-2">
      <WeatherBanner view={view} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {view.options.map((option) => (
          <AdviceCard
            key={option.mode}
            option={option}
            selected={option.mode === selected.mode}
            onSelect={() => onSelect(option.mode)}
          />
        ))}
      </div>
      <ItineraryDetails itinerary={selected.itinerary} />
    </div>
  );
}
