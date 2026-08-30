import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";

// The credit under the results column.
//
// The rules it is written against, read rather than remembered:
//
//   openstreetmap.org/copyright — using OSM data obliges you to "provide credit to
//   OpenStreetMap by displaying our attribution notice" and to "make clear that the
//   data is available under the Open Database License". The ODbL is signalled by
//   linking the word OpenStreetMap to openstreetmap.org/copyright.
//
//   open-meteo.com/en/licence — data is CC BY 4.0: "You must include a link next to
//   any location Open-Meteo data are displayed". The forecast strip sits in the
//   results column, which is where this credit is.
//
// Nominatim, Overpass and Photon all serve OpenStreetMap data, so the OpenStreetMap
// credit covers them; they are named by name in the About block in HeaderMenu, and
// Photon, which is the one that receives what the user types, is named again in the
// privacy notice.

const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";
const OPEN_METEO = "https://open-meteo.com/";

// A translated sentence with one {x} hole, with a node dropped into it. Word order
// differs between the two languages ("routes and places from {x} data" against "routes
// en plekken uit {x}-gegevens"), so the link position has to come from the string, not
// from the JSX.
function fill(text: string, node: ReactNode): ReactNode {
  const [before, after = ""] = text.split("{x}");
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

function Credit({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-fov="credit-link"
      // A 44px target, not a 13px one. These two are the app's only licence links and
      // they measured 66x13 and 83x13 — the smallest controls on the screen. `min-h`
      // on an inline-flex box gives the finger the height the rule asks for; the
      // negative inline margin cancels its padding so the sentence around it reads
      // exactly as it did. Underlined rather than colour-coded: a colour shift is not
      // a reliable affordance at this size, and the night palette's link blue would
      // fail the contrast floor.
      className="-mx-1.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1.5 align-middle underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {children}
    </a>
  );
}

/**
 * The credit under the results column. It carries the two sources the advice itself
 * rests on, which stay on screen even when the map is hidden: the forecast strip's
 * weather, and the OpenStreetMap data the routes and places are built from.
 */
export function AdviceAttribution() {
  const { t } = useI18n();
  return (
    <p
      role="note"
      aria-label={t("dataSources")}
      data-fov="attribution"
      // slate-500, not the 400 the other footnotes use: this has to clear AA against
      // white (4.8:1) as well as it does against the night surface.
      className="mt-3 px-1 text-xs leading-snug text-slate-500 dark:text-night-subtle"
    >
      {fill(t("sourceWeather"), <Credit href={OPEN_METEO}>Open-Meteo</Credit>)}
      {", "}
      {fill(t("sourceRoutes"), <Credit href={OSM_COPYRIGHT}>OpenStreetMap</Credit>)}
      {"."}
    </p>
  );
}
