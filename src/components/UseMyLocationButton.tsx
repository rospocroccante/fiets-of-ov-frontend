import { useState } from "react";
import { getCurrentPosition, geoErrorMessage, accuracyWarning } from "../geolocate";
import { useI18n } from "../lib/i18n";
import { reverseGeocode } from "../geocode";
import { coordQuery } from "../trip";
import type { Endpoint } from "../trip";

interface Props {
  onLocated: (ep: Endpoint) => void;
  className?: string;
  // Draw the name next to the icon. The desktop pill has room for an icon and nothing
  // else; the phone search screen puts this button in a row of its own, where an
  // unlabelled crosshair next to an unlabelled swap arrow is a guessing game.
  withLabel?: boolean;
}

type StatusState =
  | { kind: "warn"; text: string }
  | { kind: "error"; text: string }
  | null;

export function UseMyLocationButton({ onLocated, className, withLabel = false }: Props): JSX.Element {
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
      {/* The light-mode pair is brand navy on white. Left alone it would be 1.4:1 on a
          night surface (invisible), and its hover would flash the near-white
          brand-light; dark mode takes the emerald the rest of the app already
          substitutes for the brand, over the night hover step. */}
      <button
        type="button"
        aria-label={t("useMyLocation")}
        disabled={busy}
        onClick={handleClick}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-brand hover:bg-brand-light disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-night-hover${
          withLabel ? " gap-1.5 px-3 text-sm font-medium" : ""
        }`}
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
        {/* aria-hidden: the button already carries the same words as its accessible
            name, and a screen reader should hear them once. */}
        {withLabel && (
          <span aria-hidden="true" className="whitespace-nowrap">
            {t("useMyLocation")}
          </span>
        )}
      </button>
      {status && status.kind === "error" && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {status.text}
        </p>
      )}
      {status && status.kind === "warn" && (
        <p role="status" className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {status.text}
        </p>
      )}
    </div>
  );
}
