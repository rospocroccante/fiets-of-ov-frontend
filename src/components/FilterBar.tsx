import { useState } from "react";
import type { Mode } from "../api/types";
import { RadarControls } from "./RainRadar";
import type { WeatherLayersState } from "./RainRadar";

type Armed = "start" | "end" | null;

export type KindFilter = Record<Mode, boolean>;

const KIND_LABEL: Record<Mode, string> = {
  bike: "Bike",
  transit: "Transit",
  bike_and_ride: "Bike + OV",
};

export function FilterBar({
  count,
  hideMap,
  onToggleMap,
  armed,
  onArm,
  radar,
  wLayers,
  onToggleRadar,
  onToggleLayer,
  kinds,
  onToggleKind,
  dryOnly,
  onToggleDry,
}: {
  count: number;
  hideMap: boolean;
  onToggleMap: () => void;
  armed: Armed;
  onArm: (which: "start" | "end") => void;
  radar: boolean;
  wLayers: WeatherLayersState;
  onToggleRadar: () => void;
  onToggleLayer: (layer: keyof WeatherLayersState) => void;
  kinds: KindFilter;
  onToggleKind: (m: Mode) => void;
  dryOnly: boolean;
  onToggleDry: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pickBtn = (which: "start" | "end", label: string) => (
    <button
      type="button"
      onClick={() => onArm(which)}
      aria-pressed={armed === which}
      className={`rounded-full px-3 py-1 text-sm transition ${
        armed === which ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );

  const kindChip = (m: Mode) => (
    <button
      type="button"
      aria-pressed={kinds[m]}
      onClick={() => onToggleKind(m)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        kinds[m] ? "bg-brand text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50"
      }`}
    >
      {KIND_LABEL[m]}
    </button>
  );

  return (
    <div className="relative flex items-center justify-between gap-3 py-3">
      {/* Quick mode filters: pressed = that kind of option is shown in the results. */}
      <div className="flex items-center gap-2">
        {kindChip("bike")}
        {kindChip("transit")}
      </div>
      <span className="hidden text-sm text-gray-500 sm:inline">{count} routes in area</span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Map tools live in one segmented group: setting endpoints on the map and the
            weather radar both act on the map, so they read as a single cluster and are
            hidden together while the map is hidden. */}
        {!hideMap && (
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
            <span className="pl-2.5 pr-1 text-xs font-medium text-gray-500">Set on map</span>
            {pickBtn("start", "Start")}
            {pickBtn("end", "End")}
            <span className="mx-0.5 h-4 w-px bg-gray-200" />
            <RadarControls
              active={radar}
              layers={wLayers}
              onToggle={onToggleRadar}
              onLayerToggle={onToggleLayer}
            />
          </div>
        )}
        <button
          type="button"
          aria-pressed={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
          className={`rounded-full px-4 py-1.5 text-sm transition ${
            filtersOpen ? "bg-brand text-white" : "border border-gray-200 hover:bg-gray-50"
          }`}
        >
          Filters
        </button>
        <button
          onClick={onToggleMap}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm"
        >
          {hideMap ? "Show map" : "Hide map"}
        </button>
      </div>

      {filtersOpen && (
        <>
          {/* Transparent backdrop: any outside click closes the popover. */}
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-card border border-gray-100 bg-white p-4 shadow-lg">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Show options
            </p>
            {(Object.keys(KIND_LABEL) as Mode[]).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={kinds[m]}
                  onChange={() => onToggleKind(m)}
                  className="h-4 w-4 accent-[#13386E]"
                />
                {KIND_LABEL[m]}
              </label>
            ))}
            <div className="my-2 h-px bg-gray-100" />
            <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={dryOnly}
                onChange={onToggleDry}
                className="h-4 w-4 accent-[#13386E]"
              />
              Only dry options
            </label>
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              Hides options that put you in the rain.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
