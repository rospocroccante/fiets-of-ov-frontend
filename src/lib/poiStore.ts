import type { Poi } from "../hooks/usePois";

// Persistent per-cell POI store: the fast layer under the react-query cache. Cells
// survive reloads in localStorage (POIs change slowly, so a week of freshness is
// plenty) and are served from an in-memory Map so reads cost nothing. Writes are
// debounced into one serialized blob; on quota pressure the oldest half is dropped
// and, failing that, the store degrades to memory-only for the session.
const KEY = "fov.pois.v1";
const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_STORED_CELLS = 400;
const PERSIST_DEBOUNCE_MS = 1000;

interface StoredCell {
  at: number;
  pois: Poi[];
}

let cells: Map<string, StoredCell> | null = null;
let persistHandle: ReturnType<typeof setTimeout> | null = null;

function load(): Map<string, StoredCell> {
  if (cells) return cells;
  cells = new Map();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, StoredCell>)) {
        cells.set(k, v);
      }
    }
  } catch {
    // Corrupt or unavailable storage: start empty, stay memory-only if needed.
  }
  return cells;
}

function persist(): void {
  let m = load();
  if (m.size > MAX_STORED_CELLS) {
    cells = new Map(
      [...m.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_STORED_CELLS),
    );
    m = cells;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(m)));
  } catch {
    cells = new Map([...m.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, Math.floor(m.size / 2)));
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(cells)));
    } catch {
      // Still failing: keep serving from memory for this session.
    }
  }
}

function schedulePersist(): void {
  if (persistHandle) clearTimeout(persistHandle);
  persistHandle = setTimeout(persist, PERSIST_DEBOUNCE_MS);
}

// A stored empty array is meaningful: "this cell is known to have no POIs", which
// must not trigger a refetch. Only missing or expired entries return null.
export function getCell(key: string): Poi[] | null {
  const e = load().get(key);
  if (!e || Date.now() - e.at > TTL_MS) return null;
  return e.pois;
}

export function putCell(key: string, pois: Poi[]): void {
  load().set(key, { at: Date.now(), pois });
  schedulePersist();
}

export function putMany(entries: Iterable<readonly [string, Poi[]]>): void {
  const at = Date.now();
  const m = load();
  for (const [k, pois] of entries) m.set(k, { at, pois });
  schedulePersist();
}

// Test hook: drop the in-memory state so each test starts from localStorage.
export function __resetPoiStore(): void {
  cells = null;
  if (persistHandle) clearTimeout(persistHandle);
  persistHandle = null;
}
