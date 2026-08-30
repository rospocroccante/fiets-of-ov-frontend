// Reading the pixels a screenshot actually contains.
//
// Why this exists: the map is a WebGL canvas. Nothing about it is in the DOM, so every
// technique the rest of this suite uses (getComputedStyle, getBoundingClientRect,
// elementFromPoint) answers the same for a night basemap, a daylight basemap and a map
// that never loaded. The only honest question is what colour came out of the compositor,
// and the only place that exists is the screenshot.
//
// One trap, learned the hard way: Page.captureScreenshot with a `clip` composites the
// region again without the GL surface, and hands back a picture of the page background
// with a map-shaped hole in it. Full-viewport captures only, cropped here.
//
// The decoder is deliberately small: Chrome writes 8-bit non-interlaced PNGs, colour
// type 2 (RGB) or 6 (RGBA), which is all this handles. Anything else throws rather than
// guessing, because a silently mis-decoded image would make every assertion below
// meaningless.

import zlib from "node:zlib";

const SIGNATURE = "89504e470d0a1a0a";

/** Decode a PNG buffer into { width, height, channels, data } with 8 bits per channel. */
export function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== SIGNATURE) throw new Error("not a PNG");
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR");
  if (header.depth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.colorType)) {
    throw new Error(
      `unsupported PNG: depth ${header.depth}, colour type ${header.colorType}, interlace ${header.interlace}`,
    );
  }

  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * header.height);

  // Undo the per-scanline filters (PNG spec 9.2). Each row starts with a filter byte and
  // refers back to the row above, so this cannot be done a pixel at a time.
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value = src[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      row[x] = value & 0xff;
    }
  }
  return { width: header.width, height: header.height, channels, data: out };
}

function luminance(r, g, b) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/**
 * The mean colour of a CSS-pixel patch of a decoded screenshot, with its relative
 * luminance. `scale` is the device pixel ratio the page was captured at, so a spec can
 * pass the coordinates it read from getBoundingClientRect.
 *
 * A patch rather than a pixel on purpose: a single sample over a map lands on a street
 * casing or a label as easily as on the ground, and would make the assertion a lottery.
 */
export function patch(png, { x, y, size = 24, scale = 1 }) {
  const x0 = Math.max(0, Math.round(x * scale));
  const y0 = Math.max(0, Math.round(y * scale));
  const x1 = Math.min(png.width, Math.round((x + size) * scale));
  const y1 = Math.min(png.height, Math.round((y + size) * scale));
  if (x1 <= x0 || y1 <= y0) throw new Error(`patch at (${x}, ${y}) is outside the screenshot`);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * png.width * png.channels + px * png.channels;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n++;
    }
  }
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, n, hex: hex(r, g, b), luminance: +luminance(r, g, b).toFixed(4) };
}

/** How many distinct colours a patch contains, at 4 bits per channel. A blank map pane
 *  is one or two; a drawn one is dozens. This is what separates "the style loaded and
 *  painted streets" from "the background colour came up and nothing else did". */
export function colourCount(png, { x, y, size = 24, scale = 1 }) {
  const x0 = Math.max(0, Math.round(x * scale));
  const y0 = Math.max(0, Math.round(y * scale));
  const x1 = Math.min(png.width, Math.round((x + size) * scale));
  const y1 = Math.min(png.height, Math.round((y + size) * scale));
  const seen = new Set();
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * png.width * png.channels + px * png.channels;
      seen.add(((png.data[i] >> 4) << 8) | ((png.data[i + 1] >> 4) << 4) | (png.data[i + 2] >> 4));
    }
  }
  return seen.size;
}
