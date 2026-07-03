import { RadarControls } from "./RainRadar";
import type { WeatherLayersState } from "./RainRadar";

type Armed = "start" | "end" | null;

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
}) {
  const pickBtn = (which: "start" | "end", label: string) => (
    <button
      type="button"
      onClick={() => onArm(which)}
      aria-pressed={armed === which}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        armed === which ? "bg-brand text-white" : "border border-gray-200 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-2">
        <button className="rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium">Bike</button>
        <button className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white">
          Transit
        </button>
      </div>
      <span className="hidden text-sm text-gray-500 sm:inline">{count} routes in area</span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Map-only controls: setting endpoints on the map and the weather radar have
            no meaning while the map is hidden. */}
        {!hideMap && (
          <>
            <span className="text-xs font-medium text-gray-500">Set on map</span>
            {pickBtn("start", "Start")}
            {pickBtn("end", "End")}
            <span className="h-5 w-px bg-gray-200" />
            <RadarControls
              active={radar}
              layers={wLayers}
              onToggle={onToggleRadar}
              onLayerToggle={onToggleLayer}
            />
            <span className="h-5 w-px bg-gray-200" />
          </>
        )}
        <button className="rounded-full border border-gray-200 px-4 py-1.5 text-sm">Filters</button>
        <button
          onClick={onToggleMap}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm"
        >
          {hideMap ? "Show map" : "Hide map"}
        </button>
      </div>
    </div>
  );
}
