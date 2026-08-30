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

  // red-300 rather than the red-400 the rest of the night theme uses for errors: the
  // bubble below sits on night-raised, the popover step, and red-400 on it measures
  // 4.14:1 against the 4.5:1 that 12px text needs. red-300 is 6.03:1 there and higher on
  // every other night surface this message can land on, so one colour covers both
  // placements. Amber needs no such adjustment (6.86:1 at its worst).
  const tone =
    status?.kind === "error"
      ? "text-red-600 dark:text-red-300"
      : "text-amber-600 dark:text-amber-400";

  return (
    // relative, because the compact button hangs its message out of flow (see below).
    <div className={["relative", className].filter(Boolean).join(" ")}>
      {/* The light-mode pair is brand navy on white. Left alone it would be 1.4:1 on a
          night surface (invisible), and its hover would flash the near-white
          brand-light; dark mode takes the NS yellow the rest of the app already
          substitutes for the brand, over the night hover step. */}
      <button
        type="button"
        aria-label={t("useMyLocation")}
        disabled={busy}
        onClick={handleClick}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-brand hover:bg-brand-light disabled:opacity-50 dark:text-night-accent dark:hover:bg-night-hover${
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
      {/* Where the message goes depends on whether this button has a row to itself.
          With a label it does (the phone search sheet), and normal flow is right: the
          text pushes the rows under it down a line and nothing else moves.

          Without a label it sits inside the desktop search pill, a single flex row of
          fixed height. A paragraph in flow there is a layout change: it claims width,
          the wrapper grows to hold it, and the pill stretches with it. "Location
          request timed out. Please try again." wrapped to three lines and shoved From,
          To and Search apart, which is what the owner saw. Out of flow it costs the row
          nothing, so the pill keeps the geometry it had before the failure and still
          has it after. The bubble needs its own surface for that, because underneath it
          is the page rather than the pill. */}
      {status && (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={
            withLabel
              ? `mt-1 text-xs ${tone}`
              : `absolute left-1/2 top-full z-20 mt-1 w-max max-w-[13rem] -translate-x-1/2 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-black/5 dark:bg-night-raised dark:ring-white/10 ${tone}`
          }
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
