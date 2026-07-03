import { modeColor, modeSoftBg } from "../lib/modeColors";
import { departureLabel } from "../lib/planView";
import type { OptionView } from "../lib/planView";

const ICON: Record<OptionView["mode"], string> = {
  bike: "Bike",
  transit: "Transit",
  bike_and_ride: "Bike + OV",
};

// The advice option maps to a transport mode for its soft banner tint.
const OPTION_MODE: Record<OptionView["mode"], string> = {
  bike: "BICYCLE",
  transit: "SUBWAY",
  bike_and_ride: "FERRY",
};

export function AdviceCard({
  option,
  selected,
  onSelect,
}: {
  option: OptionView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-card border bg-white p-4 text-left shadow-sm transition ${
        selected ? "border-brand ring-2 ring-brand/30" : "border-gray-100 hover:shadow-md"
      }`}
    >
      {/* Mode banner: a soft tint of the mode colour, label in that colour. Clean, not
          loud — colour weight lives in the animated home background, not here. */}
      <div
        className="relative mb-3 flex h-24 items-center justify-center rounded-card border border-slate-100"
        style={{ backgroundImage: modeSoftBg(OPTION_MODE[option.mode]) }}
      >
        {option.recommended && (
          <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
            Recommended
          </span>
        )}
        <span
          className="text-2xl font-bold"
          style={{ color: modeColor(OPTION_MODE[option.mode]) }}
        >
          {ICON[option.mode]}
        </span>
      </div>

      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold">{option.title}</h3>
        <span className="shrink-0 text-sm font-semibold text-brand">{option.minutes} min</span>
      </div>
      <p className="mt-1 text-sm text-gray-500">{option.summary}</p>
      <p className="mt-1 text-xs font-medium text-gray-400">
        {departureLabel(option.itinerary, Date.now())}
      </p>
    </button>
  );
}
