import L from "leaflet";
// The plugin registers itself on the Leaflet namespace (L.maplibreGL), exactly the way
// leaflet-velocity does; there is nothing to name in the import. It pulls maplibre-gl in
// itself, so this module is the only place the GL engine is reachable from, which is
// what keeps it out of the jsdom suite, where there is no WebGL to give it.
import "@maplibre/maplibre-gl-leaflet";
import type { Map as GLMap } from "maplibre-gl";

// maplibre-gl.css is deliberately not imported. It is 70 kB, and all of it but two rules
// styles controls this map does not create (attribution, navigation, scale, popups,
// cooperative-gesture overlays) or cursors that only apply to an interactive GL map,
// and this one is `interactive: false`, because Leaflet owns the input. The two rules
// that do matter are in index.css next to the other map rules, named there.

// The layer as this module uses it. @maplibre/maplibre-gl-leaflet ships a .d.ts that
// augments the Leaflet module, but the augmentation only exists where the plugin is
// imported, so the handful of members used here are spelled out rather than reached for
// through a namespace that may or may not carry them.
type GLLayer = L.Layer & {
  getMaplibreMap(): GLMap;
  getContainer(): HTMLDivElement;
};

type GLFactory = (options: Record<string, unknown>) => GLLayer;

/** The vector basemap, from the caller's side: swap its style, or take it off the map. */
export interface BasemapHandle {
  setStyle(styleUrl: string): void;
  remove(): void;
}

// MapLibre GL JS 5 needs a WebGL 2 context and throws from its constructor without one.
// Asking first turns "the map died halfway through being added" into a plain false, so
// the caller can fall back to raster tiles before anything is attached to the map.
function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") != null;
  } catch {
    return false;
  }
}

/**
 * Add the OpenFreeMap vector basemap to a Leaflet map and hand back the two operations
 * the app needs: swap the style (the theme toggle) and remove the layer (unmount).
 *
 * Throws if WebGL is unavailable or the GL map cannot be built. The caller treats a
 * throw as "no GL here" and draws raster tiles instead, so nothing is left half-attached
 * on the way out.
 */
export function createBasemap(map: L.Map, styleUrl: string): BasemapHandle {
  if (!hasWebGL2()) throw new Error("no WebGL 2 context: the vector basemap cannot start");

  const factory = (L as unknown as { maplibreGL?: GLFactory }).maplibreGL;
  if (typeof factory !== "function") {
    throw new Error("maplibre-gl-leaflet did not register L.maplibreGL");
  }

  const layer = factory({
    style: styleUrl,
    // No credit is drawn on or beside the map (see MapView's attributionControl={false});
    // MapLibre would add its own control in the corner of the GL canvas by default.
    attributionControl: false,
    // Leaflet keeps every gesture: pan, pinch, wheel, the picking clicks. A GL map that
    // also listened would fight it.
    interactive: false,
    // The tile pane, under the radar frames (zIndex 5) and well under the overlay pane
    // the route, the markers and the wind canvas live in.
    pane: "tilePane",
    className: "basemap-gl",
  });

  try {
    layer.addTo(map);
  } catch (e) {
    // A GL map that threw inside onAdd leaves the layer registered and its container in
    // the pane, and Leaflet's own removeLayer would throw again on the half-built map.
    // Unpick it by hand so the raster fallback starts from a clean pane.
    try {
      map.removeLayer(layer);
    } catch {
      layer.getContainer?.()?.remove();
    }
    throw e;
  }

  const gl = layer.getMaplibreMap();
  // Two hooks for the browser suite, which has to find the basemap among a pane full of
  // canvases and know when a style swap has finished painting. `idle` is the honest
  // signal: it fires when every tile for the current view is in and drawn.
  const canvas = gl.getCanvas();
  canvas.dataset.fov = "basemap-gl";
  canvas.dataset.fovStyle = "loading";
  gl.on("idle", () => {
    canvas.dataset.fovStyle = "loaded";
  });

  return {
    setStyle(nextUrl: string) {
      canvas.dataset.fovStyle = "loading";
      // diff: false, because the two styles share no layer ids worth diffing and a diff that
      // fails mid-way leaves a half-swapped map. A full swap keeps the same GL map, the
      // same canvas and the same camera, so nothing above it is disturbed.
      gl.setStyle(nextUrl, { diff: false });
    },
    remove() {
      map.removeLayer(layer);
    },
  };
}
