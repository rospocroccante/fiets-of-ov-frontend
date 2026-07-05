import { useState } from "react";
import { getCurrentPosition, geoErrorMessage, accuracyWarning } from "../geolocate";
import { useI18n } from "../lib/i18n";
import { reverseGeocode } from "../geocode";
import { coordQuery } from "../trip";
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
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  async function handleClick() {
    setBusy(true);
    setStatus(null);
    try {
      const fix = await getCurrentPosition();
      const query = coordQuery(fix.lat, fix.lon);
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
        aria-label={t("useMyLocation")}
        disabled={busy}
        onClick={handleClick}
        className="flex items-center justify-center rounded-full p-2 text-brand hover:bg-brand-light disabled:opacity-50"
      >
        {busy ? (
          <span
            aria-hidden="true"
            className="material-symbols-rounded animate-spin text-[20px] leading-none"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            progress_activity
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="material-symbols-rounded text-[22px] leading-none"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            my_location
          </span>
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
