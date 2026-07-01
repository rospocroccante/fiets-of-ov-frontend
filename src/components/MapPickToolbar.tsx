type Armed = "start" | "end" | null;

export function MapPickToolbar({
  armed,
  onArm,
}: {
  armed: Armed;
  onArm: (which: "start" | "end") => void;
}) {
  const btn = (which: "start" | "end", label: string) => (
    <button
      onClick={() => onArm(which)}
      aria-pressed={armed === which}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        armed === which ? "bg-brand text-white" : "border border-gray-200 bg-white hover:shadow"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-1 rounded-card bg-white/95 p-2 shadow-md">
      <span className="px-1 text-xs font-medium text-gray-600">Set on map</span>
      <div className="flex gap-1">
        {btn("start", "Start")}
        {btn("end", "End")}
      </div>
      {armed && <span className="px-1 text-xs text-brand">Click the map to set the {armed}.</span>}
    </div>
  );
}
