// Generates public/styles/night.json: OpenFreeMap's `fiord` recoloured onto the app's
// `night` ramp (tailwind.config.js), so the dark basemap sits in the same deep navy as
// the rest of the night UI instead of fiord's paler blue-slate.
//
// Why a generated snapshot and not the live style: fiord's palette is the wrong blue
// AND the wrong lightness — its ground is #45516E (L 35%) against the page's night.bg
// #0A3552 (L 18%), which is why the map read as a grey-blue island on the navy UI.
// Recolouring has to touch every one of ~37 colours across 48 layers, which is a style
// document edit, not a runtime paint override. The tiles, glyphs and sprites still come
// from tiles.openfreemap.org (the style JSON keeps its absolute URLs); only the style
// document itself is served from this origin.
//
// The mapping, per colour found under a *-color property:
//   hue        S < 5% (no hue to speak of) goes straight to 204, the ramp hue.
//              Chromatic hues rotate by -20° (fiord's dominant land/road hue is ~224;
//              224 - 20 = 204) and clamp into [196, 212], so fiord's internal hue
//              spread survives, compressed around the brand hue.
//   lightness  background/fill/line layers compress toward the ramp's dark end:
//              L' = 0.05 + 0.5·L  (ground #45516E L.35 → L.23, next to `surface` L.25).
//              Symbol layers keep their lightness: label text stays light, halos stay
//              dark, contrast holds.
//   saturation solved from L', following the ramp's own saturation-vs-lightness curve
//              (shade hsl(205 82% 11%) → border hsl(204 44% 44%) → faint 24% → muted
//              60%), so dark ground comes out at brand saturation (~80%) and the light
//              text steps come out blue-tinted like `muted`/`subtle`, not dyed navy.
//   water      pinned, not derived — the owner asked for pale water ("azzurrino oppure
//              bianco"). The water fill, the waterway lines and the water-name halo are
//              `night.muted` (#CEE2F3, hsl(207 60% 88%)), and the water-name type flips
//              to `night.bg` navy so it reads on the light ground: rivers and lakes cut
//              light through the navy map, the light theme's water inverted.
//
// Regenerate with: node scripts/night-style.mjs   (then commit the JSON; the snapshot
// is deliberate — a live fetch would let an upstream restyle repaint the app unseen).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://tiles.openfreemap.org/styles/fiord";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "styles", "night.json");

const RAMP_HUE = 204;
const HUE_SHIFT = -20;
const HUE_MIN = 196;
const HUE_MAX = 212;
// The night ramp's saturation at each lightness, read straight off tailwind.config.js:
// shade, bg, surface, raised, hover, border, faint, subtle, muted (see the note there).
const SAT_CURVE = [
  [0.0, 0.82],
  [0.11, 0.82],
  [0.18, 0.78],
  [0.25, 0.8],
  [0.27, 0.68],
  [0.31, 0.62],
  [0.44, 0.44],
  [0.62, 0.24],
  [0.78, 0.42],
  [0.88, 0.6],
  [1.0, 0.6],
];

function satFor(l) {
  for (let i = 1; i < SAT_CURVE.length; i++) {
    const [l0, s0] = SAT_CURVE[i - 1];
    const [l1, s1] = SAT_CURVE[i];
    if (l <= l1) return s0 + ((s1 - s0) * (l - l0)) / (l1 - l0);
  }
  return SAT_CURVE[SAT_CURVE.length - 1][1];
}

function rgbToHsl(r, g, b) {
  (r /= 255), (g /= 255), (b /= 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/** "#rrggbb", "#rgb", "#rrggbbaa", "rgb()", "rgba()", "hsl()", "hsla()" → [h,s,l,a] | null */
function parseColor(str) {
  const s = str.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
    const n = (o) => parseInt(hex.slice(o, o + 2), 16);
    const a = hex.length === 8 ? n(6) / 255 : 1;
    return [...rgbToHsl(n(0), n(2), n(4)), a];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [...rgbToHsl(+m[1], +m[2], +m[3]), m[4] === undefined ? 1 : +m[4]];
  m = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [+m[1], +m[2] / 100, +m[3] / 100, m[4] === undefined ? 1 : +m[4]];
  return null; // named colours and expressions-as-strings do not occur in fiord
}

function recolor(str, keepLightness) {
  const parsed = parseColor(str);
  if (!parsed) return str;
  const [h, s, l, a] = parsed;
  const hue =
    s < 0.05 ? RAMP_HUE : Math.min(HUE_MAX, Math.max(HUE_MIN, ((h + HUE_SHIFT) % 360 + 360) % 360));
  const light = keepLightness ? l : 0.05 + 0.5 * l;
  const sat = satFor(light);
  const H = Math.round(hue);
  const S = Math.round(sat * 100);
  const L = Math.round(light * 100);
  return a === 1 ? `hsl(${H},${S}%,${L}%)` : `hsla(${H},${S}%,${L}%,${+a.toFixed(3)})`;
}

/** Recolour every colour string in a *-color value, including inside expressions. */
function walk(value, keepLightness) {
  if (typeof value === "string") return recolor(value, keepLightness);
  if (Array.isArray(value)) return value.map((v) => walk(v, keepLightness));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, keepLightness)]));
  return value;
}

const style = await (await fetch(SOURCE)).json();

for (const layer of style.layers) {
  const keepLightness = layer.type === "symbol"; // text and halos keep their contrast
  for (const bag of [layer.paint, layer.layout]) {
    if (!bag) continue;
    for (const [key, value] of Object.entries(bag)) {
      if (key.includes("color")) bag[key] = walk(value, keepLightness);
    }
  }
}

// Water, pinned after the derivation (see the note in the header). The three layers are
// fiord's complete water story: the polygon fill, the thin waterway lines, the names.
const WATER = "hsl(207,60%,88%)"; // night.muted — the azzurrino
const WATER_TEXT = "hsl(204,78%,18%)"; // night.bg — navy type on light water
for (const layer of style.layers) {
  if (layer.id === "water") layer.paint["fill-color"] = WATER;
  if (layer.id === "waterway") layer.paint["line-color"] = WATER;
  if (layer.id === "water_name") {
    layer.paint["text-color"] = WATER_TEXT;
    layer.paint["text-halo-color"] = WATER;
  }
}

style.name = "night (fiord recoloured onto the fiets-of-ov night ramp)";
writeFileSync(OUT, JSON.stringify(style));
console.log(`wrote ${OUT}: ${style.layers.length} layers`);
