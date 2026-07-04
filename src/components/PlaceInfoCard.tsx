export interface PlaceInfo {
  name: string;
  address: string | null;
  lat: number;
  lon: number;
}

// Maps-style place card, shown over the map after "What's here?" (or a saved chip):
// name, address, coordinates, save star, and directions shortcuts.
export function PlaceInfoCard({
  place,
  saved,
  onToggleSave,
  onDirections,
  onClose,
}: {
  place: PlaceInfo;
  saved: boolean;
  onToggleSave: () => void;
  onDirections: (which: "start" | "end") => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] w-72 rounded-card border border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">{place.name}</h3>
          {place.address && <p className="mt-0.5 truncate text-xs text-slate-500">{place.address}</p>}
          <p className="mt-0.5 text-[11px] text-slate-400">
            {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={saved ? "Remove from saved places" : "Save this place"}
            aria-pressed={saved}
            onClick={onToggleSave}
            className="rounded-full p-1.5 transition hover:bg-amber-50"
          >
            <span
              aria-hidden="true"
              className={`material-symbols-rounded text-[20px] leading-none ${
                saved ? "text-amber-500" : "text-slate-400"
              }`}
              style={{ fontVariationSettings: `'FILL' ${saved ? 1 : 0}` }}
            >
              star
            </span>
          </button>
          <button
            type="button"
            aria-label="Close place info"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <span aria-hidden="true" className="material-symbols-rounded text-[20px] leading-none">
              close
            </span>
          </button>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onDirections("start")}
          className="flex-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
        >
          From here
        </button>
        <button
          type="button"
          onClick={() => onDirections("end")}
          className="flex-1 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-light"
        >
          To here
        </button>
      </div>
    </div>
  );
}
