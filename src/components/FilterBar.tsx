import { useState } from "react";
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
  dryOnly,
  onToggleDry,
  onResetFilters,
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
  dryOnly: boolean;
  onToggleDry: () => void;
  onResetFilters: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = Object.values(kinds).filter((on) => !on).length + (dryOnly ? 1 : 0);

  // Two button treatments, both with a constant box so toggling never resizes the bar:
  // standalone chips keep a border in every state (transparent when filled), segments
  // inside the map-tools group are borderless (the group carries the border).
  const chip = (pressed: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm font-medium transition ${
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
    <div className="relative flex items-center justify-between gap-3 py-3">
      {/* Left cluster: quick mode filters plus the live count. The count lives here so
          changes on the right side of the bar never push it around. */}
      <div className="flex items-center gap-2">
        {(["bike", "transit"] as Mode[]).map((m) => (
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

      <div className="flex items-center gap-2">
        {/* Map tools in one segmented group: endpoints-on-map and the radar both act on
            the map, so they read as a single cluster and hide together with it. The
            group's content is fixed (the Rain/Wind picker lives on the map itself), so
            its width never changes. */}
        {!hideMap && (
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
            <span className="pl-2.5 pr-1 text-xs font-medium text-gray-500">Set on map</span>
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
        <button
          type="button"
          aria-label="Filters"
          aria-pressed={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
          className={chip(filtersOpen)}
        >
          <span className="flex items-center gap-1.5">
            Filters
            {activeFilters > 0 && (
              <span
                className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${
                  filtersOpen ? "bg-white text-brand" : "bg-brand text-white"
                }`}
              >
                {activeFilters}
              </span>
            )}
          </span>
        </button>
        {/* Fixed width: "Hide map" and "Show map" differ slightly, and a resizing
            button would nudge the whole right cluster on every toggle. */}
        <button
          onClick={onToggleMap}
          className="min-w-[6.5rem] rounded-full border border-gray-200 px-4 py-1.5 text-center text-sm"
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
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-3 w-full rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              Reset filters
            </button>
          </div>
        </>
      )}
    </div>
  );
}
