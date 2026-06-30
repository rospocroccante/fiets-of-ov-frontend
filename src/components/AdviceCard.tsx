import type { OptionView } from "../lib/planView";

const ICON: Record<OptionView["mode"], string> = { bike: "Bike", transit: "Transit" };

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
      <div className="relative mb-3 flex h-24 items-center justify-center rounded-card bg-brand-light">
        {option.recommended && (
          <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
            Recommended
          </span>
        )}
        <span className="text-2xl font-bold text-brand">{ICON[option.mode]}</span>
      </div>

      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold">{option.title}</h3>
        <span className="shrink-0 text-sm font-semibold text-brand">{option.minutes} min</span>
      </div>
      <p className="mt-1 text-sm text-gray-500">{option.summary}</p>
    </button>
  );
}
