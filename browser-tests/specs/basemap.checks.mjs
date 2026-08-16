// The basemap, in pixels.
//
// The map stopped being DOM the day it became MapLibre GL: one <canvas> and a WebGL
// context, with every street, label and shade of night inside it. Nothing the rest of
// this suite measures can tell a night basemap from a daylight one, or from a map that
// never loaded, because getComputedStyle and elementFromPoint answer the same for all
// three. So these scenarios read the screenshot: decode the PNG Chrome hands back and
// look at what the compositor actually produced over the map pane (lib/pixels.mjs).
//
// What they are guarding, concretely:
//   the styles     dark theme draws the dark style and light draws bright. Pointing
//                  both at bright is a one-character change in components/Basemap that
//                  nothing else in the repo notices: the app keeps working, and the map
//                  glows white next to a night-black interface.
//   the layer      a GL canvas inside the Leaflet container, and no credit painted on
//                  it. MapLibre draws its own attribution control by default, which is
//                  the thing MapView's attributionControl={false} was set against.
//   the order      the rain radar paints ABOVE the basemap. The GL layer sits in the
//                  same tile pane as the radar frames, so their order is a z-index away
//                  from being wrong, and a radar under an opaque basemap is invisible.
//   the toggle     switching theme swaps the style on the map that is already there,
//                  keeping the same canvas and the same overlays. Rebuilding the layer
//                  instead would drop the radar and flash the page through the map.
//   the fallback   a browser with no WebGL gets PDOK raster tiles instead of the vector
//                  map (components/Basemap). That path ships, renders and contacts a
//                  host of its own, and cutting the one `.catch` that arms it left every
//                  other gate in this repository green while the map went blank.
//   the ceiling    the + button stops. Leaflet reads its zoom ceiling off the tile
//                  layers on the map, and a GL layer is not one, so without MapView's
//                  maxZoom the control never disables and the map zooms into nothing.

import { sleep } from "../lib/chrome.mjs";
import { PROBE, TRIP_SEED } from "../lib/measure.mjs";
import { decodePng, patch, colourCount } from "../lib/pixels.mjs";

const PILL = '[data-fov="search-pill"]';
const MORE = '[data-fov="filter-more"]';
const MAP = ".leaflet-container";
const GL = 'canvas[data-fov="basemap-gl"]';
const GL_PAINTED = `${GL}[data-fov-style="loaded"]`;
const RADAR_TILES = ".rain-radar-tiles";
const RASTER = ".basemap-raster";
const ZOOM_IN = ".leaflet-control-zoom-in";

// A browser with no WebGL, made out of one that has it: `getContext` answers null for
// every GL context name, which is what a blacklisted driver, an enterprise policy or a
// GPU-less runner does. It is installed with Page.addScriptToEvaluateOnNewDocument
// BEFORE the navigation (see bootMap), because lib/basemapGL asks for a context while
// the map is being built and the answer has to be no by then.
const NO_WEBGL = `
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (typeof type === "string" && /webgl/i.test(type)) return null;
    return original.call(this, type, ...rest);
  };
`;

// Measured on this branch, 390x844, over Amsterdam at the app's opening zoom:
//   dark style    L 0.005 to 0.015 over ground, water and built-up blocks
//   bright        L 0.59 to 0.80 (its water, #b1d1e2, is the floor of that range)
//   night page    L 0.021 (night.bg #20282E), night surface L 0.033
// The floors sit between the two styles: a map wearing the wrong one fails them.
//
// They do NOT catch a map that never painted, and it is worth being exact about why,
// because the obvious reading is wrong. What shows through where no basemap drew is the
// Leaflet container's own background, not the page: leaflet.css:261 ships
// `.leaflet-container { background: #ddd }`, which measures L 0.7231 and sails past the
// light floor, and in dark index.css paints it night.shade (#171D21, L 0.0138) which
// sails past the dark one. Both are flat. The guard against a dead map, in either theme,
// is COLOUR_FLOOR below: a drawn map has streets, water and labels in it, a background
// has one colour. Keep it on every scenario that samples pixels.
const DARK_MAX_LUMINANCE = 0.05;
const LIGHT_MIN_LUMINANCE = 0.5;
// Measured margins on this branch: dark 6 to 9 distinct colours per 28 px square, light
// 27 to 103, a failed paint exactly 1.
const COLOUR_FLOOR = 4;

function round(n) {
  return typeof n === "number" ? Math.round(n * 10000) / 10000 : n;
}

async function bootMap(ctx, { width, height, theme = "light", lang = "en", inject = null }) {
  const page = await ctx.openPhone({ width, height, theme, lang, seed: TRIP_SEED });
  // Anything that has to be true before the app's first line runs goes in here, and it
  // has to be installed before the navigation: the fallback scenario takes WebGL away,
  // and a page that has already booted with it has the vector map on the screen.
  if (inject) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: inject });
  await page.goto(ctx.url);
  await page.waitFor(`document.querySelector('${PILL}')`, { label: "the app to render" });
  await page.eval(PROBE);
  const row = await page.eval(`
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Zuidplein"));
    if (!b) return null;
    window.__fov.reveal(b);
    return window.__fov.rect(b);
  `);
  if (!row) throw new Error("the seeded recent trip is not on the home screen");
  await page.tap(row.x + row.w / 2, row.y + row.h / 2);
  await page.waitFor(`document.querySelector('${MAP}')`, { label: "the map" });
  await sleep(900); // the morph, and the map chunk settling under it
  await page.eval(PROBE);
  return page;
}

// Wait until the GL basemap has finished painting. `data-fov-style` is set to "loaded"
// on MapLibre's `idle` event (lib/basemapGL), which fires once every tile for the current
// view is in and drawn, the one signal that means "what is on the screen is the style".
// Tiles come off the network here, so this is the wait everything else hangs off.
async function waitForBasemap(page, { timeout = 30000 } = {}) {
  try {
    await page.waitFor(`document.querySelector('${GL_PAINTED}')`, {
      timeout,
      label: "the basemap style to load and paint",
    });
  } catch (e) {
    // The one failure that is not a defect in the app: a runner with no GPU and no
    // software GL. There the app is working (it draws the PDOK raster fallback) and this
    // wait still times out, which used to cost 95 s per run and say nothing about why.
    // Chrome needs --enable-unsafe-swiftshader for WebGL when it has no GPU; lib/chrome
    // passes it everywhere but macOS.
    const gl = await hasWebGL(page);
    if (!gl) throw new Error(`${e.message} (WebGL unavailable in this browser)`);
    throw e;
  }
  // One more frame after `idle`, so the capture cannot land between the paint and the
  // compositor.
  await sleep(250);
}

// Can this page get a WebGL 2 context at all? The same question lib/basemapGL asks
// before it builds the vector map (hasWebGL2), asked from the outside.
async function hasWebGL(page) {
  try {
    return await page.eval(`
      try {
        const c = document.createElement("canvas");
        return !!(c.getContext("webgl2") || c.getContext("webgl"));
      } catch (e) {
        return false;
      }
    `);
  } catch {
    // A page that cannot even be evaluated in is a different failure; do not claim to
    // know anything about its WebGL.
    return true;
  }
}

// Points on the map pane where the basemap itself is what a screenshot would show.
//
// A patch that lands on the route, a marker, the zoom control, an on-map chip or an open
// menu measures those instead, and would answer "the map is not dark" in a way that has
// nothing to do with the basemap. Two filters, because there are two ways to be in the
// way: things drawn inside the map (the route, the markers) are excluded by their boxes,
// and anything painted over the map from elsewhere in the page is excluded by hit-testing
// the square's centre and corners, whatever the DOM shape of the thing on top.
async function mapSpots(page, { size = 28, want = 5 } = {}) {
  const spots = await page.eval(`
    const size = ${size}, want = ${want};
    const map = document.querySelector('${MAP}');
    const r = map.getBoundingClientRect();
    const blockers = [
      ...map.querySelectorAll('.leaflet-overlay-pane path, .leaflet-marker-icon, .leaflet-control-container > *'),
    ].map((n) => n.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    const onMap = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return !!el && (el === map || map.contains(el));
    };
    const clear = (x, y) => {
      const box = { left: x, top: y, right: x + size, bottom: y + size };
      if (box.right > Math.min(r.right, innerWidth) || box.bottom > Math.min(r.bottom, innerHeight)) return false;
      if (box.left < r.left || box.top < r.top) return false;
      if (blockers.some((b) =>
        box.left < b.right + 6 && box.right > b.left - 6 && box.top < b.bottom + 6 && box.bottom > b.top - 6)) return false;
      const m = 2;
      return onMap(x + size / 2, y + size / 2) && onMap(x + m, y + m) && onMap(box.right - m, y + m) &&
        onMap(x + m, box.bottom - m) && onMap(box.right - m, box.bottom - m);
    };
    const w = Math.min(r.right, innerWidth) - r.left, h = Math.min(r.bottom, innerHeight) - r.top;
    const out = [];
    for (const fy of [0.22, 0.4, 0.58, 0.76, 0.3, 0.66]) {
      for (const fx of [0.18, 0.46, 0.74, 0.32, 0.6]) {
        const x = Math.round(r.left + w * fx), y = Math.round(r.top + h * fy);
        if (!clear(x, y)) continue;
        if (out.some((p) => Math.abs(p.x - x) < size && Math.abs(p.y - y) < size)) continue;
        out.push({ x, y });
        if (out.length >= want) return { spots: out, dpr: devicePixelRatio, pane: window.__fov.rect(map) };
      }
    }
    return { spots: out, dpr: devicePixelRatio, pane: window.__fov.rect(map) };
  `);
  if (spots.spots.length === 0) throw new Error("no clear patch of basemap to sample");
  return spots;
}

// The mean colour of each spot, off a real screenshot. Full-viewport capture on purpose:
// a clipped one composites without the WebGL surface and comes back blank (lib/pixels).
async function sample(page, geometry, { size = 28 } = {}) {
  const png = decodePng(await page.capturePng());
  return geometry.spots.map((s) => ({
    ...s,
    ...patch(png, { x: s.x, y: s.y, size, scale: geometry.dpr }),
    colours: colourCount(png, { x: s.x, y: s.y, size, scale: geometry.dpr }),
  }));
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Is there a MAP in the map, or only a colour? The luminance floors cannot answer this
// (see the note on them above): a container with no tiles on it is flat #ddd by day and
// flat night.shade at night, and both pass. Streets, water, buildings and labels are
// what put more than a handful of colours in a 28 px square, so this is the assertion
// that stays true whatever the theme, the style or the tile source. Every scenario that
// samples pixels runs it.
function checkDrawn(checks, at, patches) {
  const most = Math.max(...patches.map((p) => p.colours));
  checks.atLeast(
    `${at}: the basemap has a map drawn in it, not just a background colour`,
    most,
    COLOUR_FLOOR,
    `most varied patch: ${most} distinct colours. ` +
      patches.map((p) => `(${p.x},${p.y}) ${p.hex} L=${round(p.luminance)}`).join("  "),
  );
}

// Turn the rain radar on the way a user does: the map-tools control on the filter bar,
// then the Radar row, then a tap outside to put the panel away. That last tap is not
// cosmetic: while the panel is open it holds a full-screen click catcher over the map,
// and a screenshot taken then is of a map nobody can point at.
async function turnRadarOn(page, { height }) {
  const more = await page.eval(`
    const b = document.querySelector('${MORE}');
    return b ? window.__fov.rect(b) : null;
  `);
  if (!more) throw new Error("no map-tools control on the filter bar");
  await page.tap(more.x + more.w / 2, more.y + more.h / 2);
  await sleep(300);
  const radar = await page.eval(`
    const scope = document.querySelector('[data-fov="filter-panel"]') || document;
    const b = [...scope.querySelectorAll('button')].find((x) => /radar/i.test(x.textContent || ""));
    return b ? { ...window.__fov.rect(b), pressed: b.getAttribute("aria-pressed") } : null;
  `);
  if (!radar) throw new Error("no radar control in the map tools");
  await page.tap(radar.x + radar.w / 2, radar.y + radar.h / 2);
  await page.waitFor(`document.querySelectorAll('${RADAR_TILES} img').length > 0`, { label: "radar tiles" });
  await page.tap(20, height - 40);
  await page.waitFor(`!document.querySelector('[data-fov="filter-panel"]')`, { label: "the map tools to close" });
  await sleep(400);
  return radar;
}

export const scenarios = [
  {
    // The whole question in one line: at night, is the map dark, and by day, light?
    name: "390x844 the basemap is a real GL layer, dark at night and light by day",
    async run(ctx) {
      const seen = {};
      for (const theme of ["light", "dark"]) {
        const at = `390x844 ${theme}`;
        const page = await bootMap(ctx, { width: 390, height: 844, theme });
        try {
          await waitForBasemap(page);

          const layer = await page.eval(`
            const c = document.querySelector('${GL}');
            const map = document.querySelector('${MAP}');
            const pane = document.querySelector('.leaflet-tile-pane');
            return {
              canvas: !!c,
              inContainer: !!(c && c.closest('${MAP}')),
              inTilePane: !!(c && pane && pane.contains(c)),
              pixels: c ? c.width * c.height : 0,
              styleState: c ? c.dataset.fovStyle : null,
              attribution: [...map.querySelectorAll('[class*="attrib" i]')]
                .map((n) => n.className).slice(0, 3),
              onMapText: (map.textContent || "").replace(/\\s+/g, " ").trim(),
            };
          `);
          checkLayer(ctx.checks, at, layer);

          const geometry = await mapSpots(page);
          const patches = await sample(page, geometry);
          ctx.checks.atLeast(
            `${at}: there are clear patches of basemap to read`,
            patches.length,
            3,
            `${patches.length} of 5 candidate squares were free of route, markers and chips`,
          );
          const lum = mean(patches.map((p) => p.luminance));
          seen[theme] = lum;

          if (theme === "dark") {
            for (const p of patches) {
              ctx.checks.atMost(
                `${at}: the map at (${p.x}, ${p.y}) is painted dark`,
                p.luminance,
                DARK_MAX_LUMINANCE,
                `${p.hex}, L=${round(p.luminance)} (night.bg is L=0.021, bright measures L 0.59 to 0.80)`,
              );
            }
          } else {
            for (const p of patches) {
              ctx.checks.atLeast(
                `${at}: the map at (${p.x}, ${p.y}) is painted light`,
                p.luminance,
                LIGHT_MIN_LUMINANCE,
                `${p.hex}, L=${round(p.luminance)}`,
              );
            }
          }
          checkDrawn(ctx.checks, at, patches);
        } finally {
          await page.close();
        }
      }

      // The two themes against each other, which is the assertion that survives a change
      // of tile server, a restyle, or a screen calibration: night is not day.
      ctx.checks.atLeast(
        "390x844: the night basemap is far darker than the daylight one",
        seen.light / Math.max(seen.dark, 1e-6),
        10,
        `light L=${round(seen.light)}, dark L=${round(seen.dark)}, ratio ${round(seen.light / Math.max(seen.dark, 1e-6))}x`,
      );
    },
  },

  {
    // Switching theme has to restyle the map that is on the screen. The tempting
    // implementation (drop the layer, build another one) loses every overlay attached
    // to it and shows the page through the map while the new tiles arrive.
    name: "390x844 switching theme restyles the basemap in place, keeping the radar on it",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 390, height: 844, theme: "light" });
      try {
        await waitForBasemap(page);

        // Radar on first, through the map tools, so the toggle has an overlay to lose.
        await turnRadarOn(page, { height: 844 });

        const before = await page.eval(`
          const c = document.querySelector('${GL}');
          c.dataset.fovStamp = "same-canvas";
          document.querySelector('${MAP}').dataset.fovStamp = "same-map";
          return { frames: document.querySelectorAll('${RADAR_TILES}').length, style: c.dataset.fovStyle };
        `);
        const lightPatches = await sample(page, await mapSpots(page));
        checkDrawn(checks, "before the toggle", lightPatches);

        // The theme switch, the way a user makes it.
        const menu = await page.eval(`
          const b = [...document.querySelectorAll('button')].find((x) => /^menu/i.test((x.textContent||"").trim()));
          return b ? window.__fov.rect(b) : null;
        `);
        if (!menu) throw new Error("no header menu button");
        await page.tap(menu.x + menu.w / 2, menu.y + menu.h / 2);
        await sleep(250);
        const toggle = await page.eval(`
          const b = [...document.querySelectorAll('button')].find((x) => /dark mode|donkere modus/i.test(x.textContent || ""));
          return b ? window.__fov.rect(b) : null;
        `);
        if (!toggle) throw new Error("no dark-mode control in the header menu");
        await page.tap(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
        // The menu stays open after the switch, by design (every label flips in place).
        // Close it the way it was opened, or it sits over the map the screenshot is of.
        await page.tap(menu.x + menu.w / 2, menu.y + menu.h / 2);
        await sleep(250);
        await waitForBasemap(page);

        const after = await page.eval(`
          const c = document.querySelector('${GL}');
          return {
            themeClass: document.documentElement.classList.contains("dark"),
            sameCanvas: c ? c.dataset.fovStamp === "same-canvas" : false,
            sameMap: document.querySelector('${MAP}')?.dataset.fovStamp === "same-map",
            canvases: document.querySelectorAll('${GL}').length,
            frames: document.querySelectorAll('${RADAR_TILES}').length,
            tiles: document.querySelectorAll('${RADAR_TILES} img').length,
          };
        `);
        checks.ok(`the app is in the dark theme after the toggle`, after.themeClass, `html.dark = ${after.themeClass}`);
        checks.ok(
          `the map was restyled, not rebuilt: same GL canvas element`,
          after.sameCanvas && after.canvases === 1,
          `stamp survived: ${after.sameCanvas}, GL canvases on the page: ${after.canvases}`,
        );
        checks.ok(`the Leaflet map itself is untouched`, after.sameMap, `stamp survived: ${after.sameMap}`);
        checks.equal(`the radar frames are still on the map`, after.frames, before.frames, `and ${after.tiles} tiles`);

        const darkPatches = await sample(page, await mapSpots(page));
        checkDrawn(checks, "after the toggle", darkPatches);
        const lightL = mean(lightPatches.map((p) => p.luminance));
        const darkL = mean(darkPatches.map((p) => p.luminance));
        checks.atMost(
          `the map went dark where it was light`,
          darkL,
          DARK_MAX_LUMINANCE,
          `before ${lightPatches.map((p) => p.hex).join(",")} L=${round(lightL)}, ` +
            `after ${darkPatches.map((p) => p.hex).join(",")} L=${round(darkL)}`,
        );
        checks.atLeast(`the swap actually changed the pixels`, lightL / Math.max(darkL, 1e-6), 10, `${round(lightL / Math.max(darkL, 1e-6))}x`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // Rain over the city has to be visible over the city. The radar frames and the GL
    // basemap share the tile pane, where the only thing keeping the radar on top is its
    // z-index: 5 against the GL layer's auto. This asserts the rule and then shows it in
    // pixels, because a rule that is true and not applied looks identical from the DOM.
    name: "390x844 the rain radar paints above the vector basemap",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 390, height: 844, theme: "dark" });
      try {
        await waitForBasemap(page);
        await turnRadarOn(page, { height: 844 });

        const order = await page.eval(`
          const pane = document.querySelector('.leaflet-tile-pane');
          const gl = document.querySelector('${GL}');
          const glLayer = gl ? gl.closest('.leaflet-gl-layer') : null;
          const frames = [...document.querySelectorAll('${RADAR_TILES}')];
          const zOf = (n) => { const z = getComputedStyle(n).zIndex; return z === "auto" ? null : Number(z); };
          const kids = [...pane.children];
          return {
            samePane: !!glLayer && frames.length > 0 && frames.every((f) => f.parentElement === glLayer.parentElement),
            glZ: glLayer ? zOf(glLayer) : "no layer",
            radarZ: frames.map(zOf),
            glIndex: glLayer ? kids.indexOf(glLayer) : -1,
            radarIndexes: frames.map((f) => kids.indexOf(f)),
            tiles: document.querySelectorAll('${RADAR_TILES} img').length,
          };
        `);
        checks.ok(`the radar frames and the basemap are in the same pane`, order.samePane, `tile pane`);
        checks.ok(
          `the basemap takes no z-index of its own`,
          order.glZ === null,
          `GL layer z-index: ${order.glZ}`,
        );
        checks.ok(
          `every radar frame is stacked above it`,
          order.radarZ.length > 0 && order.radarZ.every((z) => z != null && z > 0),
          `radar z-index: ${JSON.stringify(order.radarZ)} against the basemap's auto, ${order.tiles} tiles`,
        );

        // The pixels. Mock mode serves a transparent pixel for every radar tile (a suite
        // that reached rainviewer.com would answer differently on a dry day), so the
        // frames are given an opaque fill for one screenshot: whatever a radar tile paints
        // has to reach the screen over the basemap. Tiles, not their container: the
        // container is a zero-size box and would prove nothing.
        const geometry = await mapSpots(page);
        const beforeProbe = await sample(page, geometry);
        checkDrawn(checks, "under the radar", beforeProbe);
        const painted = await page.eval(`
          const imgs = [...document.querySelectorAll('${RADAR_TILES} img')];
          for (const img of imgs) { img.style.background = "#ff00ff"; }
          const frames = [...document.querySelectorAll('${RADAR_TILES}')];
          for (const f of frames) { f.style.opacity = "1"; }
          return imgs.length;
        `);
        await sleep(300);
        const afterProbe = await sample(page, geometry);
        await page.eval(`
          for (const img of document.querySelectorAll('${RADAR_TILES} img')) { img.style.background = ""; }
          return true;
        `);

        checks.atLeast(`the radar has tiles covering the map`, painted, 1, `${painted} tiles filled for the probe`);
        for (let i = 0; i < afterProbe.length; i++) {
          const p = afterProbe[i];
          const was = beforeProbe[i];
          checks.ok(
            `what a radar tile paints at (${p.x}, ${p.y}) reaches the screen`,
            p.r > 120 && p.b > 120 && p.g < p.r / 2,
            `basemap alone was ${was.hex}, with the radar tile filled it is ${p.hex} ` +
              `(the fill is #ff00ff; a basemap on top would have left ${was.hex})`,
          );
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    // The other basemap this app ships.
    //
    // WebGL is missing more often than it sounds: an enterprise policy that turns it off,
    // a blacklisted driver, a CI runner with no GPU. `Basemap` catches the failure and
    // draws PDOK's BRT-Achtergrondkaart as plain raster tiles, which is a working map
    // instead of a hole in the page. Nothing tested it, and cutting the single `.catch`
    // that arms it left tsc, eslint, 353 unit tests and every browser assertion green
    // with a blank map on the screen.
    //
    // This runs the app with WebGL taken away and asks the same questions the GL
    // scenarios ask: which host served the tiles, did they arrive, is the night map dark,
    // is there a map in it at all.
    name: "390x844 with no WebGL the basemap falls back to PDOK raster tiles",
    async run(ctx) {
      const { checks } = ctx;
      for (const theme of ["light", "dark"]) {
        const at = `390x844 ${theme} without WebGL`;
        const page = await bootMap(ctx, { width: 390, height: 844, theme, inject: NO_WEBGL });
        try {
          // Raster tiles come off the network, so this is the wait the rest hangs off.
          // The GL path's `idle` stamp does not exist here; loaded <img> elements are the
          // equivalent signal.
          await page.waitFor(
            `[...document.querySelectorAll('${RASTER} img')].filter((i) => i.complete && i.naturalWidth > 0).length >= 3`,
            { timeout: 30000, label: "the PDOK raster tiles to load and paint" },
          );
          await sleep(400);

          const layer = await page.eval(`
            const raster = document.querySelector('${RASTER}');
            const pane = document.querySelector('.leaflet-tile-pane');
            const imgs = [...document.querySelectorAll('${RASTER} img')];
            const url = (i) => { try { return new URL(i.src); } catch (e) { return null; } };
            return {
              webgl: (() => {
                try {
                  const c = document.createElement("canvas");
                  return !!(c.getContext("webgl2") || c.getContext("webgl"));
                } catch (e) { return false; }
              })(),
              glCanvases: document.querySelectorAll('${GL}').length,
              inTilePane: !!(raster && pane && pane.contains(raster)),
              tiles: imgs.length,
              loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
              hosts: [...new Set(imgs.map((i) => (url(i) ? url(i).host : "?")))],
              layers: [...new Set(imgs.map((i) => (url(i) ? url(i).pathname.split("/")[5] : "?")))],
              filter: raster ? getComputedStyle(raster).filter : "no raster layer",
            };
          `);

          checks.ok(`${at}: WebGL really is gone from this page`, !layer.webgl, `getContext("webgl2") returns ${layer.webgl}`);
          checks.equal(`${at}: no GL canvas was left on the map`, layer.glCanvases, 0);
          checks.ok(`${at}: the raster fallback layer is in the tile pane`, layer.inTilePane, `${RASTER} inside .leaflet-tile-pane`);
          checks.atLeast(`${at}: its tiles arrived`, layer.loaded, 3, `${layer.loaded} of ${layer.tiles} tiles decoded`);
          checks.equal(
            `${at}: every tile came from PDOK`,
            layer.hosts.join(","),
            "service.pdok.nl",
            "the host the About block and the privacy notice name for this path",
          );
          // PDOK serves no night map, so night is `grijs` inverted by CSS and day is
          // `standaard` untouched. Both halves are asserted, because inverting the colour
          // map instead of the grey one is dark enough to pass the luminance floor below
          // and is a photo negative to look at.
          checks.equal(`${at}: the PDOK layer matches the theme`, layer.layers.join(","), theme === "dark" ? "grijs" : "standaard");
          if (theme === "dark") {
            checks.ok(
              `${at}: the raster layer is inverted for night`,
              /invert\(1\)/.test(layer.filter),
              `computed filter: ${layer.filter}`,
            );
          } else {
            checks.equal(`${at}: the raster layer is unfiltered by day`, layer.filter, "none");
          }

          const patches = await sample(page, await mapSpots(page));
          checks.atLeast(
            `${at}: there are clear patches of basemap to read`,
            patches.length,
            3,
            `${patches.length} of 5 candidate squares were free of route, markers and chips`,
          );
          for (const p of patches) {
            if (theme === "dark") {
              checks.atMost(
                `${at}: the map at (${p.x}, ${p.y}) is painted dark`,
                p.luminance,
                DARK_MAX_LUMINANCE,
                `${p.hex}, L=${round(p.luminance)} (uninverted PDOK measures L>0.6)`,
              );
            } else {
              checks.atLeast(
                `${at}: the map at (${p.x}, ${p.y}) is painted light`,
                p.luminance,
                LIGHT_MIN_LUMINANCE,
                `${p.hex}, L=${round(p.luminance)}`,
              );
            }
          }
          checkDrawn(checks, at, patches);
        } finally {
          await page.close();
        }
      }
    },
  },

  {
    // Where the + button stops.
    //
    // Leaflet takes its zoom ceiling from the tile layers on the map, and the GL basemap
    // is not one: `getMaxZoom()` answers Infinity and zoom-in never disables, so the map
    // keeps zooming past anything the tiles can draw. MapView sets maxZoom={19} for that
    // reason, and nothing pinned it: removing it left all four gates green while the
    // control tapped 32 times without stopping.
    name: "390x844 the zoom-in control stops at the basemap's last level",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 390, height: 844, theme: "light" });
      try {
        await waitForBasemap(page);
        const zoomIn = await page.eval(`
          const b = document.querySelector('${ZOOM_IN}');
          return b ? { ...window.__fov.rect(b), disabled: b.classList.contains("leaflet-disabled") } : null;
        `);
        if (!zoomIn) throw new Error("no zoom control on the map");
        checks.ok(`the + control starts enabled`, !zoomIn.disabled, `at the opening view of a planned trip`);

        // Bounded, because the failure this is written against is a button that never
        // stops: 25 taps is 14 levels past the opening view and 6 past the ceiling.
        const LIMIT = 25;
        let taps = 0;
        let stoppedAfter = null;
        while (taps < LIMIT && stoppedAfter === null) {
          await page.tap(zoomIn.x + zoomIn.w / 2, zoomIn.y + zoomIn.h / 2);
          taps++;
          const disabled = await page.eval(
            `return document.querySelector('${ZOOM_IN}').classList.contains("leaflet-disabled");`,
          );
          if (disabled) stoppedAfter = taps;
        }
        checks.ok(
          `the + control disables itself at the zoom ceiling`,
          stoppedAfter !== null,
          stoppedAfter !== null
            ? `disabled after ${stoppedAfter} taps from the opening view`
            : `still enabled after ${taps} taps. MapView's maxZoom is the only ceiling on this map: ` +
              `Leaflet reads getMaxZoom() off tile layers and the GL basemap is not one, so without it the answer is Infinity`,
        );

        // And the ceiling is somewhere the map still exists. A cap set past the tiles
        // would pass the assertion above and show a blur, or nothing.
        //
        // Read after the map has finished drawing at the new zoom, not after a fixed
        // sleep: `idle` fires on every settle and lib/basemapGL re-stamps the canvas each
        // time, so clearing the stamp and then nudging the camera by a small pan makes
        // the next settle something to wait for. A screenshot taken mid-load measures how
        // fast the tiles came, not whether there is a map at z19.
        await page.eval(`document.querySelector('${GL}').dataset.fovStyle = "nudged"; return true;`);
        await page.swipe(195, 320, 290);
        await waitForBasemap(page);
        const patches = await sample(page, await mapSpots(page));
        checkDrawn(checks, `at the zoom ceiling`, patches);
      } finally {
        await page.close();
      }
    },
  },
];

function checkLayer(checks, at, layer) {
  checks.ok(`${at}: the basemap is a GL canvas`, layer.canvas, layer.canvas ? `${layer.pixels} px` : "no canvas");
  checks.ok(`${at}: it lives inside the Leaflet map`, layer.inContainer && layer.inTilePane, "in .leaflet-container, tile pane");
  checks.equal(`${at}: its style finished painting`, layer.styleState, "loaded");
  // Any attribution control at all, by class name, rather than the two known ones: it is
  // Leaflet's `.leaflet-control-attribution` that comes back the moment MapView's
  // attributionControl={false} does not (and this selector is what caught that in
  // mutation), while MapLibre's `.maplibregl-ctrl-attrib` cannot appear through this
  // bridge at all: @maplibre/maplibre-gl-leaflet forces attributionControl: false onto
  // the GL map inside an L.extend that overrides caller options
  // (leaflet-maplibre-gl.js:156). Naming that class specifically would be a guard
  // against something that cannot happen.
  checks.ok(
    `${at}: no attribution control of any kind is drawn on the map`,
    layer.attribution.length === 0,
    layer.attribution.length ? `found ${JSON.stringify(layer.attribution)}` : "none",
  );
  // The text of the credit itself, whatever draws it. "Leaflet" is in the list because
  // that is the string that actually leaked when the control came back: Leaflet's own
  // control credits Leaflet first and the tile source only if a layer declares one.
  checks.ok(
    `${at}: no tile or data credit is drawn on the map`,
    !/OpenStreetMap|CARTO|OpenFreeMap|OpenMapTiles|MapLibre|Leaflet|PDOK|Kadaster/i.test(layer.onMapText),
    `map text: ${JSON.stringify(layer.onMapText.slice(0, 80))}`,
  );
}
