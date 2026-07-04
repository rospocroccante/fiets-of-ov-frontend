import type { RecentTrip } from "../hooks/useRecentTrips";
import type { SavedPlace } from "../hooks/useSavedPlaces";

function timeAgo(at: number, now: number): string {
  const min = Math.max(1, Math.round((now - at) / 60000));
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Maps-style shortcuts on the home: saved places as chips, recent searches as rows.
// Renders nothing until the user has history, so a first visit stays pristine.
export function HomeShortcuts({
  saved,
  recents,
  onPickSaved,
  onPickRecent,
  onClearRecents,
  now = Date.now(),
}: {
  saved: SavedPlace[];
  recents: RecentTrip[];
  onPickSaved: (p: SavedPlace) => void;
  onPickRecent: (t: RecentTrip) => void;
  onClearRecents: () => void;
  now?: number;
}) {
  if (saved.length === 0 && recents.length === 0) return null;
  return (
    <section className="mx-auto mt-8 w-full max-w-4xl px-6 text-left">
      {saved.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {saved.slice(0, 6).map((p) => (
            <button
              key={p.id}
              onClick={() => onPickSaved(p)}
              title={`Directions to ${p.name}`}
              className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white/90 hover:shadow"
            >
              <span
                aria-hidden="true"
                className="material-symbols-rounded text-[16px] leading-none text-amber-500"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {recents.length > 0 && (
        <div className="rounded-card border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between px-4 pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Recent
            </span>
            <button
              onClick={onClearRecents}
              className="text-[11px] font-medium text-slate-400 transition hover:text-slate-600"
            >
              Clear
            </button>
          </div>
          <ul>
            {recents.slice(0, 3).map((t) => (
              <li key={`${t.fromQuery}-${t.toQuery}`}>
                <button
                  onClick={() => onPickRecent(t)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-white/80"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-rounded text-[18px] leading-none text-slate-400"
                  >
                    history
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {t.fromLabel} <span className="text-slate-400">{"→"}</span> {t.toLabel}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(t.at, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
