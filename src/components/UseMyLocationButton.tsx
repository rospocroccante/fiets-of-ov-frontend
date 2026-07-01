import { useState } from "react";
import { getCurrentPosition, geoErrorMessage, accuracyWarning } from "../geolocate";
import { reverseGeocode } from "../geocode";
import type { Endpoint } from "../trip";

interface Props {
  onLocated: (ep: Endpoint) => void;
  className?: string;
}

type StatusState =
  | { kind: "warn"; text: string }
  | { kind: "error"; text: string }
  | null;

export function UseMyLocationButton({ onLocated, className }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  async function handleClick() {
    setBusy(true);
    setStatus(null);
    try {
      const fix = await getCurrentPosition();
      const query = `${fix.lat.toFixed(6)},${fix.lon.toFixed(6)}`;
      const label = await reverseGeocode(fix.lat, fix.lon);
      onLocated({ label, query });
      const w = accuracyWarning(fix.accuracy);
      if (w) {
        setStatus({ kind: "warn", text: w });
      }
    } catch (e) {
      setStatus({ kind: "error", text: geoErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-label="Use my location"
        disabled={busy}
        onClick={handleClick}
        className="flex items-center justify-center rounded-full p-2 text-brand hover:bg-brand-light disabled:opacity-50"
      >
        {busy ? (
          <svg
            aria-hidden="true"
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        )}
      </button>
      {status && status.kind === "error" && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {status.text}
        </p>
      )}
      {status && status.kind === "warn" && (
        <p role="status" className="mt-1 text-xs text-amber-600">
          {status.text}
        </p>
      )}
    </div>
  );
}
