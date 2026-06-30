export function FilterBar({
  count,
  hideMap,
  onToggleMap,
}: {
  count: number;
  hideMap: boolean;
  onToggleMap: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        <button className="rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium">Bike</button>
        <button className="rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white">
          Transit
        </button>
      </div>
      <span className="text-sm text-gray-500">{count} routes in area</span>
      <div className="flex items-center gap-2">
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
