import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { VelocityRecord } from "../hooks/useWindField";

// Animated wind particles (leaflet-velocity), zoom.earth style. The plugin mutates a
// canvas pane on the real Leaflet map, so it is loaded lazily and skipped entirely on
// non-browser (test) maps.
export function WindVelocityLayer({ data }: { data: VelocityRecord[] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data || !map || typeof (map as L.Map).addLayer !== "function") return;
    let cancelled = false;
    let layer: L.Layer | null = null;
    import("leaflet-velocity")
      .then(() => {
        if (cancelled) return;
        const factory = (
          L as unknown as { velocityLayer?: (opts: object) => L.Layer }
        ).velocityLayer;
        if (!factory) return;
        layer = factory({
          data,
          displayValues: false,
          maxVelocity: 20,
          velocityScale: 0.01,
          particleAge: 90,
          particleMultiplier: 1 / 250,
          lineWidth: 1.5,
          colorScale: ["#94a3b8", "#64748b", "#2f80ed", "#d97706", "#dc2626"],
        });
        layer.addTo(map as L.Map);
        // Soften the whole particle canvas via CSS. The plugin's own `opacity`
        // option doubles as the per-frame trail fade factor (lowering it clips the
        // trails short), and velocityLayer.setOpacity delegates to a method its
        // canvas layer does not implement.
        const canvas = (layer as unknown as { _canvasLayer?: { _canvas?: HTMLElement } })
          ._canvasLayer?._canvas;
        if (canvas) canvas.style.opacity = "0.55";
      })
      .catch(() => {
        // Wind stays off if the plugin cannot load; the rest of the map is unaffected.
      });
    return () => {
      cancelled = true;
      if (layer) (map as L.Map).removeLayer(layer);
    };
  }, [data, map]);
  return null;
}
