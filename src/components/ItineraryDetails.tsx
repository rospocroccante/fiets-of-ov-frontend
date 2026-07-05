import type { Itinerary, PlanLeg } from "../api/types";
import { translate, useI18n } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import { modeColor } from "../lib/modeColors";
import { transitLabel } from "../lib/planView";

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

export function ItineraryDetails({ itinerary }: { itinerary: Itinerary }) {
  const { lang, t } = useI18n();
  return (
    <div className="rounded-card border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#2A2F34]">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="font-semibold dark:text-slate-100">{t("stepByStep")}</h4>
        <span className="text-sm text-gray-500 dark:text-slate-400">
          {hhmm(itinerary.start_time)} – {hhmm(itinerary.end_time)} · {itinerary.minutes} min
        </span>
      </div>
      <ol className="space-y-3">
        {itinerary.legs.map((leg, i) => (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              {/* Chip colour matches the leg's line colour on the map (lib/modeColors). */}
              <span
                className="flex h-7 min-w-[2rem] items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-semibold text-white"
                style={{ backgroundColor: modeColor(leg.mode) }}
              >
                {legTitle(leg, lang)}
              </span>
              {i < itinerary.legs.length - 1 && (
                <span className="my-1 w-px flex-1 bg-gray-200 dark:bg-white/15" />
              )}
            </div>
            <div className="pb-1">
              <p className="text-sm font-medium dark:text-slate-200">
                {leg.from.name || t("start")} <span className="text-gray-400 dark:text-slate-500">→</span>{" "}
                {leg.to.name || t("destination")}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {hhmm(leg.start_time)}–{hhmm(leg.end_time)} · {leg.minutes} min
                {leg.distance_m != null && ` · ${Math.round(leg.distance_m)} m`}
                {leg.headsign && ` · ${t("towardsX", { x: leg.headsign })}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
