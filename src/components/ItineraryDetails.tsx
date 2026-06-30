import type { Itinerary, PlanLeg } from "../api/types";
import { transitLabel } from "../lib/planView";

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function isTransit(mode: string): boolean {
  return mode !== "WALK" && mode !== "BICYCLE";
}

function legTitle(leg: PlanLeg): string {
  if (leg.mode === "WALK") return "Walk";
  if (leg.mode === "BICYCLE") return "Bike";
  return `${transitLabel(leg.mode)} ${leg.route ?? ""}`.trim();
}

export function ItineraryDetails({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="font-semibold">Step by step</h4>
        <span className="text-sm text-gray-500">
          {hhmm(itinerary.start_time)} – {hhmm(itinerary.end_time)} · {itinerary.minutes} min
        </span>
      </div>
      <ol className="space-y-3">
        {itinerary.legs.map((leg, i) => (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 min-w-[2rem] items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-semibold ${
                  isTransit(leg.mode) ? "bg-brand text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {legTitle(leg)}
              </span>
              {i < itinerary.legs.length - 1 && <span className="my-1 w-px flex-1 bg-gray-200" />}
            </div>
            <div className="pb-1">
              <p className="text-sm font-medium">
                {leg.from.name || "Start"} <span className="text-gray-400">→</span>{" "}
                {leg.to.name || "Destination"}
              </p>
              <p className="text-xs text-gray-500">
                {hhmm(leg.start_time)}–{hhmm(leg.end_time)} · {leg.minutes} min
                {leg.distance_m != null && ` · ${Math.round(leg.distance_m)} m`}
                {leg.headsign && ` · towards ${leg.headsign}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
