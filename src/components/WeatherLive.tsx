import { useEffect, useState } from "react";
import { WMSTileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { CLOUD_LAYER, EUMETSAT_WMS_URL } from "../hooks/useCloudFrames";
import type { VelocityRecord } from "../hooks/useWindField";

// Animated Meteosat geocolour clouds: every frame stays mounted (tiles cache, no
// flicker) and only the active one is visible, with a hold on the newest frame —
// the same loop pattern as the rain radar.
export function CloudOverlay({ times }: { times: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (times.length < 2) return;
    let i = 0;
    let hold = 0;
    const id = setInterval(() => {
      if (i === times.length - 1 && hold < 3) {
        hold += 1;
        return;
      }
      hold = 0;
      i = (i + 1) % times.length;
      setIndex(i);
    }, 700);
    return () => clearInterval(id);
  }, [times]);

  const active = Math.min(index, Math.max(times.length - 1, 0));
  return (
    <>
      {times.map((t, i) => (
        <WMSTileLayer
          key={t}
          // TIME lives in the URL, not in `params`: a params object is recreated on
          // every animation tick, and react-leaflet answers any new params reference
          // with setParams() -> full tile redraw, so the slow EUMETSAT tiles would be
          // discarded every 700ms and never paint.
          url={`${EUMETSAT_WMS_URL}?time=${encodeURIComponent(t)}`}
          layers={CLOUD_LAYER}
          format="image/png"
          transparent
          version="1.3.0"
          opacity={i === active ? 0.75 : 0}
          zIndex={4}
          // The MTG sensor resolves ~1 km; requesting sharper tiles just exposes hard
          // data-pixel squares at city zoom. Cap requests at z7 (~750 m/px, at parity
          // with the sensor) and let the browser upscale with its smooth filtering.
          maxNativeZoom={7}
        />
      ))}
    </>
  );
}

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
