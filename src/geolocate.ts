export interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
}

export type GeoErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";

export class GeoError extends Error {
  kind: GeoErrorKind;

  constructor(kind: GeoErrorKind, message: string) {
    super(message);
    this.name = "GeoError";
    this.kind = kind;
  }
}

export const ACCURACY_WARN_M = 100;

export function getCurrentPosition(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeoError("unsupported", "Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        let kind: GeoErrorKind;
        if (err.code === err.PERMISSION_DENIED) {
          kind = "denied";
        } else if (err.code === err.TIMEOUT) {
          kind = "timeout";
        } else {
          kind = "unavailable";
        }
        reject(new GeoError(kind, err.toString ? err.toString() : String(err)));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

export function accuracyWarning(accuracy: number): string | null {
  if (accuracy <= ACCURACY_WARN_M) return null;
  return `Approximate location (±${Math.round(accuracy)}m). Refine the start on the map if needed.`;
}

export function geoErrorMessage(err: unknown): string {
  if (err instanceof GeoError) {
    switch (err.kind) {
      case "denied":
        return "Location access was denied. Please allow location permission in your browser settings.";
      case "timeout":
        return "Location request timed out. Please try again.";
      case "unsupported":
        return "Geolocation is not supported by this browser.";
      case "unavailable":
        return "Location unavailable. Please check your device settings.";
    }
  }
  return "Location unavailable.";
}
