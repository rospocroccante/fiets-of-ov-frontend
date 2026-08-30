export interface Endpoint {
  label: string;
  query: string;
}

export interface Trip {
  from: string;
  to: string;
  // Bumped once per user-initiated submit. A plan is a snapshot of departures, so
  // asking for the same route again must re-plan rather than replay an answer whose
  // "leave at 15:12" went by ten minutes ago; the plan query keys on this nonce.
  submit?: number;
}

// The backend's from/to query format for raw coordinates: "lat,lon" at 6 decimals
// (about 10 cm). One definition so the call sites cannot drift apart.
export function coordQuery(lat: number, lon: number): string {
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}
