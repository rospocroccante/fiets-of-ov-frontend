import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

// Guards for the two things that only exist outside the React tree: the link-preview
// metadata in index.html and the installable icon set under public/. Neither can be
// checked by rendering, and both fail silently in the one place they matter, which is
// somebody else's inbox or somebody else's home screen. The rule they all share is
// that a declared file has to exist and be the size it says it is: a card that points
// at a missing image renders as a bare URL, exactly the state this replaced.
//
// Dimensions alone certify nothing. icon-192.png and apple-touch-icon.png both shipped
// at exactly the size the manifest claimed while holding a zoomed top-left fragment of
// the artwork, because the generator screenshotted a window smaller than headless
// Chrome will open (see the recipe in index.html). A blank 192x192 white PNG passed the
// whole suite. So the icons are decoded and their pixels counted below.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PUBLIC = join(ROOT, "public");

const html = readFileSync(join(ROOT, "index.html"), "utf8");

// PNG dimensions live in the IHDR chunk: 8-byte signature, 4-byte length, "IHDR",
// then width and height as big-endian 32-bit integers. No image library needed.
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(12, 16).toString("ascii"), `${file} is not a PNG`).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Enough of a PNG decoder to count pixels: 8-bit, non-interlaced, RGB or RGBA, which
// is everything the recipe in index.html produces. IDAT chunks are one zlib stream cut
// at arbitrary points, so they are concatenated before inflating, and each scanline
// carries a filter byte that has to be undone against the line above it (PNG spec,
// section 9). No image library, and no new dependency for a test.
function decodePng(file: string): { width: number; height: number; rgba: Uint8Array } {
  const buf = readFileSync(file);
  expect(buf.subarray(12, 16).toString("ascii"), `${file} is not a PNG`).toBe("IHDR");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const [depth, colourType, , , interlace] = [buf[24], buf[25], buf[26], buf[27], buf[28]];
  expect(depth, `${file}: this decoder only reads 8-bit PNGs`).toBe(8);
  expect(interlace, `${file}: this decoder only reads non-interlaced PNGs`).toBe(0);
  expect([2, 6], `${file}: unexpected PNG colour type ${colourType}`).toContain(colourType);

  const idat: Buffer[] = [];
  for (let o = 8; o + 12 <= buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.subarray(o + 4, o + 8).toString("ascii");
    if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    if (type === "IEND") break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  expect(raw.length, `${file}: inflated data is not ${height} filtered scanlines`).toBe(
    height * (stride + 1),
  );

  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    const filter = raw[at];
    const line = new Uint8Array(raw.subarray(at + 1, at + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`${file}: unknown PNG filter type ${filter} on row ${y}`);
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      rgba[d] = line[s];
      rgba[d + 1] = line[s + 1];
      rgba[d + 2] = line[s + 2];
      rgba[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}

// coverage: share of the canvas that is not fully transparent. colours: distinct RGB
// values among those pixels.
function pixelStats(file: string): { coverage: number; colours: number } {
  const { width, height, rgba } = decodePng(file);
  const colours = new Set<number>();
  let covered = 0;
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] === 0) continue;
    covered++;
    colours.add((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]);
  }
  return { coverage: covered / (width * height), colours: colours.size };
}

function meta(attr: "property" | "name", key: string): string | null {
  const m = html.match(
    new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, "s"),
  );
  return m ? m[1] : null;
}

// The multi-line <meta> elements prettier wraps put content on its own line, so the
// single-line matcher above misses them; this one accepts both shapes.
function metaLoose(attr: "property" | "name", key: string): string | null {
  const m = html.match(
    new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"\\s*/>`, "s"),
  );
  if (m) return m[1];
  const wrapped = html.match(
    new RegExp(`<meta\\s*\\n\\s*${attr}="${key}"\\s*\\n\\s*content="([^"]*)"\\s*\\n\\s*/>`, "s"),
  );
  return wrapped ? wrapped[1] : null;
}

test("index.html carries the Open Graph tags a link preview needs", () => {
  expect(meta("property", "og:type")).toBe("website");
  expect(meta("property", "og:title")).toBe("Fiets of OV");
  expect(metaLoose("property", "og:description")).toMatch(/regen, wind en reistijd/i);
  expect(meta("property", "og:url")).toMatch(/^https:\/\//);
  // Scrapers resolve og:image against nothing: a root-relative path is a coin flip.
  expect(meta("property", "og:image")).toMatch(/^https:\/\/\S+\/og\.png$/);
  expect(metaLoose("property", "og:image:alt")).toBeTruthy();
});

test("the Twitter card is the large one, and points at the same image", () => {
  expect(meta("name", "twitter:card")).toBe("summary_large_image");
  expect(meta("name", "twitter:title")).toBe("Fiets of OV");
  expect(metaLoose("name", "twitter:description")).toBeTruthy();
  expect(meta("name", "twitter:image")).toBe(meta("property", "og:image"));
});

test("the og:image exists and is the 1200x630 the tags claim", () => {
  const file = join(PUBLIC, "og.png");
  expect(existsSync(file), "public/og.png is missing").toBe(true);
  const { width, height } = pngSize(file);
  expect(width).toBe(Number(meta("property", "og:image:width")));
  expect(height).toBe(Number(meta("property", "og:image:height")));
  expect([width, height]).toEqual([1200, 630]);
});

test("iOS has an apple-touch-icon to use instead of a screenshot of the page", () => {
  expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  const file = join(PUBLIC, "apple-touch-icon.png");
  expect(existsSync(file), "public/apple-touch-icon.png is missing").toBe(true);
  expect(pngSize(file)).toEqual({ width: 180, height: 180 });
});

test("the manifest declares 192 and 512 PNGs and a maskable icon, and all of them exist", () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8")) as {
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };

  for (const icon of manifest.icons) {
    const file = join(PUBLIC, icon.src.replace(/^\//, ""));
    expect(existsSync(file), `${icon.src} is declared but not in public/`).toBe(true);
    if (!icon.src.endsWith(".png")) continue;
    // A PNG whose real size disagrees with `sizes` is worse than no entry: the
    // launcher picks it for a slot it does not fit.
    const [w, h] = icon.sizes.split("x").map(Number);
    expect(pngSize(file), `${icon.src} is not ${icon.sizes}`).toEqual({ width: w, height: h });
  }

  const png = (size: string, purpose: string) =>
    manifest.icons.find(
      (i) => i.type === "image/png" && i.sizes === size && i.purpose.split(" ").includes(purpose),
    );
  // The two sizes Chrome's install prompt requires, plus the padded variant Android
  // crops to its own shape. Without a maskable entry the launcher shrinks the "any"
  // icon into a white circle.
  expect(png("192x192", "any"), "no 192x192 any-purpose PNG").toBeDefined();
  expect(png("512x512", "any"), "no 512x512 any-purpose PNG").toBeDefined();
  expect(png("512x512", "maskable"), "no 512x512 maskable PNG").toBeDefined();
});

test("the manifest theme_color matches the light theme-color meta, so install and launch paint the same chrome", () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8")) as {
    theme_color?: string;
  };
  const light = html.match(
    /<meta\s+name="theme-color"\s+media="\(prefers-color-scheme: light\)"\s+content="(#[0-9A-Fa-f]{6})"/,
  );
  expect(light, "no light theme-color meta in index.html").not.toBeNull();
  // The manifest used to say #0D4A73: Android's splash and title bar launched teal, then snapped to the white the metas paint.
  expect(manifest.theme_color?.toLowerCase()).toBe(light![1].toLowerCase());
});

// Every PNG the app declares. All of them are the same mark on the same badge, so the
// same two floors apply to all five.
const IMAGES = [
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "og.png",
];

test.each(IMAGES)("%s holds drawn artwork, not a blank canvas or a crop", (name) => {
  const { coverage, colours } = pixelStats(join(PUBLIC, name));
  // Navy badge, NS yellow tram, white bicycle: three before antialiasing adds any.
  // A blank canvas, a solid fill or a flat rectangle with one corner cannot reach it.
  expect(colours, `${name} has only ${colours} distinct colours`).toBeGreaterThanOrEqual(3);
  // The badge fills its canvas; icon.svg's rx=14 corners are the only thing missing,
  // and they cost 4%. A top-left crop of an over-large render is what fails here:
  // icon-192.png shipped at 42.6% and apple-touch-icon.png at 41.1%.
  expect(
    coverage,
    `${name} is only ${(coverage * 100).toFixed(1)}% non-transparent`,
  ).toBeGreaterThan(0.6);
});

test("the apple-touch-icon is fully opaque, because iOS composites transparency onto black", () => {
  // Not a stylistic preference: a transparent home-screen icon comes out with black
  // wherever the artwork does not cover, which is how this file last shipped.
  expect(pixelStats(join(PUBLIC, "apple-touch-icon.png")).coverage).toBe(1);
});
