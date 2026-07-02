import { useQuery } from "@tanstack/react-query";

// EUMETSAT View WMS: open access, CORS-enabled, Meteosat Third Generation geocolour
// composite (the zoom.earth look) at a 10-minute cadence, ~30-40 min behind realtime.
export const EUMETSAT_WMS_URL = "https://view.eumetsat.int/geoserver/wms";
export const CLOUD_LAYER = "mtg_fd:rgb_geocolour";

const CAPABILITIES_URL =
  `${EUMETSAT_WMS_URL}?service=WMS&version=1.3.0&request=GetCapabilities`;

// Eight 10-minute frames = the last ~80 minutes of cloud motion.
const FRAME_COUNT = 8;
const FRAME_STEP_MS = 10 * 60 * 1000;

// The latest published frame must come from the capabilities document: guessing from
// the wall clock breaks (a too-new TIME gets a 502, painting broken tiles).
export function parseLatestTime(capabilitiesXml: string): string | null {
  const layerAt = capabilitiesXml.indexOf(`<Name>${CLOUD_LAYER}</Name>`);
  if (layerAt < 0) return null;
  const block = capabilitiesXml.slice(layerAt, layerAt + 4000);
  const dim = block.match(/<Dimension name="time"[^>]*>([^<]*)<\/Dimension>/);
  if (!dim) return null;
  // Extent format: "start/end/period" — the end is the newest published frame.
  const parts = dim[1].trim().split("/");
  return parts.length >= 2 ? parts[1] : null;
}

export function buildFrameTimes(latestIso: string): string[] {
  const latest = new Date(latestIso).getTime();
  if (Number.isNaN(latest)) return [];
  return Array.from({ length: FRAME_COUNT }, (_, i) =>
    new Date(latest - (FRAME_COUNT - 1 - i) * FRAME_STEP_MS).toISOString(),
  );
}

// Returns ISO times oldest-first for the animation loop; empty until loaded.
export function useCloudFrames(enabled: boolean): string[] {
  const query = useQuery<string[]>({
    queryKey: ["cloud-frames"],
    enabled,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(CAPABILITIES_URL);
      if (!res.ok) throw new Error(`EUMETSAT capabilities failed: ${res.status}`);
      const latest = parseLatestTime(await res.text());
      if (!latest) throw new Error("EUMETSAT capabilities: no time extent");
      return buildFrameTimes(latest);
    },
  });
  return query.data ?? [];
}
