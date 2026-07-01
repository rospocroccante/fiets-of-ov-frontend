export interface Endpoint {
  label: string;
  query: string;
}

export interface Trip {
  from: string;
  to: string;
}

export interface TripDraft {
  from: Endpoint;
  to: Endpoint;
}
