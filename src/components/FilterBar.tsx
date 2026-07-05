import type { Mode } from "../api/types";

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
  onToggleRadar,
  kinds,
  onToggleKind,
}: {
  count: number;
  hideMap: boolean;
  onToggleMap: () => void;
  armed: Armed;
  onArm: (which: "start" | "end") => void;
  radar: boolean;
  onToggleRadar: () => void;
  kinds: KindFilter;
  onToggleKind: (m: Mode) => void;
}) {
  // Two button treatments, both with a constant box so toggling never resizes the bar:
  // standalone chips keep a border in every state (transparent when filled), segments
  // inside the map-tools group are borderless (the group carries the border).
  const chip = (pressed: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
      pressed
        ? "border-transparent bg-brand text-white"
        : "border-gray-200 text-gray-500 hover:bg-gray-50"
    }`;
  const segment = (pressed: boolean) =>
    `rounded-full px-3 py-1 text-sm transition ${
      pressed ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"
    }`;

  const pickBtn = (which: "start" | "end", label: string) => (
    <button
      type="button"
      onClick={() => onArm(which)}
      aria-pressed={armed === which}
      className={segment(armed === which)}
    >
      {label}
    </button>
  );

  return (
    // On narrow screens the bar scrolls sideways instead of wrapping, so its height
    // (and everything below it) never moves.
    <div className="flex items-center justify-between gap-3 overflow-x-auto py-3">
      {/* Left cluster: the filters themselves — one chip per option kind — plus the
          live count. The count lives here so changes on the right never push it. */}
      <div className="flex shrink-0 items-center gap-2">
        {(Object.keys(KIND_LABEL) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={kinds[m]}
            onClick={() => onToggleKind(m)}
            className={chip(kinds[m])}
          >
            {KIND_LABEL[m]}
          </button>
        ))}
        <span className="hidden pl-1 text-sm text-gray-500 sm:inline">{count} routes in area</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Map tools in one segmented group: endpoints-on-map and the radar both act on
            the map, so they read as a single cluster and hide together with it. The
            group's content is fixed (the Rain/Wind picker lives on the map itself), so
            its width never changes. */}
        {!hideMap && (
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
            <span className="hidden pl-2.5 pr-1 text-xs font-medium text-gray-500 sm:inline">
              Set on map
            </span>
            {pickBtn("start", "Start")}
            {pickBtn("end", "End")}
            <span className="mx-0.5 h-4 w-px bg-gray-200" />
            <button
              type="button"
              aria-pressed={radar}
              onClick={onToggleRadar}
              className={segment(radar)}
            >
              Radar
            </button>
          </div>
        )}
        {/* Fixed width: "Hide map" and "Show map" differ slightly, and a resizing
            button would nudge the whole right cluster on every toggle. */}
        <button
          onClick={onToggleMap}
          className="min-w-[6.5rem] rounded-full border border-gray-200 px-4 py-1.5 text-center text-sm"
        >
          {hideMap ? "Show map" : "Hide map"}
        </button>
      </div>
    </div>
  );
}
