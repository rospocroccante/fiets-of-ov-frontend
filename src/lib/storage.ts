// Tiny safe wrapper around localStorage JSON: private browsing, quota errors and
// corrupted entries must never crash the app — they just mean "no stored data".
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort: history and saved places are conveniences, not critical data.
  }
}
