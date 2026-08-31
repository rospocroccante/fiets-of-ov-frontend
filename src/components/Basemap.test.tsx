import { render } from "@testing-library/react";
import {
  BASEMAP_FALLBACK,
  BASEMAP_STYLE,
  Basemap,
  basemapFallbackUrl,
  basemapStyleUrl,
} from "./Basemap";

// What jsdom can answer about the basemap is which URL each theme asks for, and that the
// GL engine is never touched here. The layer itself (a WebGL canvas, its style swap and
// the raster fallback) is proved in the browser suite, browser-tests/specs/basemap.checks.mjs.

test("each theme has its own OpenFreeMap style, and neither is CARTO", () => {
  // `bright`, not `liberty`: it is the OpenFreeMap style measured closest to the CARTO
  // voyager raster this app used to draw, mostly because of the water (see the note over
  // BASEMAP_STYLE). Changing it back to liberty turns every canal cornflower blue, which
  // is a change nobody asked for, so the exact style is pinned here rather than left to
  // "any light style will do".
  expect(basemapStyleUrl(false)).toBe("https://tiles.openfreemap.org/styles/bright");
  expect(basemapStyleUrl(true)).toBe("https://tiles.openfreemap.org/styles/fiord");
  // The dark theme reading the light style is the mutation this pins: the map would go
  // on looking fine in daylight and stay bright at night.
  expect(basemapStyleUrl(true)).not.toBe(basemapStyleUrl(false));
  for (const url of Object.values(BASEMAP_STYLE)) {
    expect(url).toMatch(/^https:\/\/tiles\.openfreemap\.org\//);
    expect(url).not.toMatch(/carto/i);
  }
});

test("the no-WebGL fallback is PDOK BRT-A, one layer per theme", () => {
  expect(basemapFallbackUrl(false)).toContain("/standaard/");
  expect(basemapFallbackUrl(true)).toContain("/grijs/");
  for (const url of Object.values(BASEMAP_FALLBACK)) {
    expect(url).toMatch(/^https:\/\/service\.pdok\.nl\/brt\/achtergrondkaart\/wmts\//);
    // Leaflet fills these in; a template missing one silently requests the same tile
    // for the whole map.
    expect(url).toContain("{z}/{x}/{y}");
  }
});

test("on a map with no Leaflet behind it the basemap draws nothing and loads no GL", async () => {
  // The unit suite's react-leaflet mock hands out a map object with no addLayer, which
  // is the guard that keeps maplibre-gl out of jsdom (it needs a WebGL context there is
  // no way to give it). If this ever renders something, the import guard has moved.
  const { container } = render(<Basemap dark />);
  await Promise.resolve();
  expect(container).toBeEmptyDOMElement();
});
