import { useQuery } from "@tanstack/react-query";

export interface RadarFrame {
  time: number; // unix seconds of the radar snapshot
  url: string; // Leaflet tile URL template for this frame
}

interface RainViewerMaps {
  host: string;
  radar: {
    past: { time: number; path: string }[];
    nowcast: { time: number; path: string }[];
  };
}

// RainViewer public composite radar: free, no key, refreshed ~every 5 minutes.
// Color scheme 2 ("Universal Blue"), smooth rendering, no snow separation.
// 512 px tiles: radar tiles only exist up to zoom 7 (above that the server returns a
// "Zoom Level Not Supported" placeholder), so the layer upscales — see RADAR_MAX_NATIVE_ZOOM.
const INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json";
const TILE_SUFFIX = "/512/{z}/{x}/{y}/2/1_1.png";

// Leaflet TileLayer options that make the low-native-zoom radar usable at city zoom:
// request z-1 512px tiles (zoomOffset -1) and clamp tile requests at the last zoom the
// server actually renders, letting Leaflet scale them up (radar data is ~1-4 km
// resolution, so soft upscaled blobs are the honest rendering).
export const RADAR_TILE_OPTIONS = { tileSize: 512, zoomOffset: -1, maxNativeZoom: 7 } as const;

// Recent past frames plus the short nowcast: enough for a readable animation loop
// without mounting dozens of tile layers.
const PAST_FRAMES = 6;
const NOWCAST_FRAMES = 2;

export interface RainRadarState {
  frames: RadarFrame[];
  // Surfaced so the UI can say "radar unavailable" instead of silently showing a
  // clean map that reads as "dry" during an outage.
  error: boolean;
}

export function useRainRadar(enabled: boolean): RainRadarState {
  const query = useQuery<RadarFrame[]>({
    queryKey: ["rain-radar"],
    enabled,
    refetchInterval: 5 * 60 * 1000,
    // The index refreshes ~every 5 minutes: re-enabling the layer (chip toggle,
    // coming back to the map) within that window must not refetch.
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const res = await fetch(INDEX_URL, { signal });
      if (!res.ok) throw new Error(`radar index failed: ${res.status}`);
      const data = (await res.json()) as RainViewerMaps;
      if (!Array.isArray(data?.radar?.past) || !Array.isArray(data?.radar?.nowcast)) {
        throw new Error("radar index: unexpected shape");
      }
      const frames = [
        ...data.radar.past.slice(-PAST_FRAMES),
        ...data.radar.nowcast.slice(0, NOWCAST_FRAMES),
      ];
      return frames.map((f) => ({ time: f.time, url: `${data.host}${f.path}${TILE_SUFFIX}` }));
    },
  });
  return { frames: query.data ?? [], error: query.isError };
}
