export interface Endpoint {
  label: string;
  query: string;
}

export interface Trip {
  from: string;
  to: string;
}

// The backend's from/to query format for raw coordinates: "lat,lon" at 6 decimals
// (about 10 cm). One definition so the call sites cannot drift apart.
export function coordQuery(lat: number, lon: number): string {
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}
