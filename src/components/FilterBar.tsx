import type { Mode } from "../api/types";
import { useI18n } from "../lib/i18n";
import type { StringKey } from "../lib/i18n";

type Armed = "start" | "end" | null;

export type KindFilter = Record<Mode, boolean>;

const KIND_KEY: Record<Mode, StringKey> = {
  bike: "bike",
  transit: "transit",
  bike_and_ride: "bikeAndRide",
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
  const { t } = useI18n();
  // Two button treatments, both with a constant box so toggling never resizes the bar:
  // standalone chips keep a border in every state (transparent when filled), segments
  // inside the map-tools group are borderless (the group carries the border).
  // Both treatments carry min-h-[44px]: at py-1.5/py-1 they measured 34px and 28px, and
  // this bar is the phone's main control surface (mode filters, map pickers, radar).
  const chip = (pressed: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full border px-3 text-sm font-medium transition sm:px-4 ${
      pressed
        ? "border-transparent bg-brand text-white dark:bg-emerald-600"
        : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-night-border dark:text-night-muted dark:hover:bg-night-hover"
    }`;
  const segment = (pressed: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full px-3 text-sm transition ${
      pressed
        ? "bg-brand text-white dark:bg-emerald-600"
        : "text-gray-600 hover:bg-gray-100 dark:text-night-muted dark:hover:bg-night-hover"
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
        {(Object.keys(KIND_KEY) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={kinds[m]}
            onClick={() => onToggleKind(m)}
            className={chip(kinds[m])}
          >
            {t(KIND_KEY[m])}
          </button>
        ))}
        <span className="hidden pl-1 text-sm text-gray-500 dark:text-night-subtle sm:inline">
          {t("routesInArea", { n: count })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Map tools in one segmented group: endpoints-on-map and the radar both act on
            the map, so they read as a single cluster and hide together with it. The
            group's content is fixed (the Rain/Wind picker lives on the map itself), so
            its width never changes. */}
        {!hideMap && (
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5 dark:border-night-border dark:bg-night-surface">
            <span className="hidden pl-2.5 pr-1 text-xs font-medium text-gray-500 dark:text-night-subtle sm:inline">
              {t("setOnMap")}
            </span>
            {pickBtn("start", t("start"))}
            {pickBtn("end", t("end"))}
            <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-night-border" />
            <button
              type="button"
              aria-pressed={radar}
              onClick={onToggleRadar}
              className={segment(radar)}
            >
              {t("radar")}
            </button>
          </div>
        )}
        {/* Fixed width: "Hide map" and "Show map" differ slightly, and a resizing
            button would nudge the whole right cluster on every toggle. */}
        <button
          onClick={onToggleMap}
          className="inline-flex min-h-[44px] min-w-[6.5rem] items-center justify-center rounded-full border border-gray-200 px-4 text-center text-sm dark:border-night-border dark:text-night-muted dark:hover:bg-night-hover"
        >
          {hideMap ? t("showMap") : t("hideMap")}
        </button>
      </div>
    </div>
  );
}
