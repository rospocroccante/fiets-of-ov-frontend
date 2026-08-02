import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Guards for the dark theme's "night" palette. None of this can be checked by
// rendering: jsdom has no Tailwind, so the tokens only exist as config values and as
// class names. What is worth protecting is the three invariants the palette rests on —
// the browser-chrome colour matching the page, the contrast floors the ramp was solved
// for, and the fact that nothing hard-codes a dark surface any more.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function nightTokens(): Record<string, string> {
  const config = readFileSync(join(ROOT, "tailwind.config.js"), "utf8");
  const block = config.match(/night:\s*\{([\s\S]*?)\n\s*\},/);
  if (!block) throw new Error("no `night` colour block in tailwind.config.js");
  return Object.fromEntries(
    [...block[1].matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2].toUpperCase()]),
  );
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function sourceFiles(): string[] {
  return readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .map((f) => join(ROOT, "src", f));
}

test("the dark theme-color meta is the night page colour", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const meta = html.match(
    /<meta\s+name="theme-color"\s+media="\(prefers-color-scheme: dark\)"\s+content="(#[0-9A-Fa-f]{6})"/,
  );
  expect(meta, "no dark theme-color meta in index.html").not.toBeNull();
  // A stale value here paints a seam between the browser chrome and the page.
  expect(meta![1].toUpperCase()).toBe(nightTokens().bg);
});

test("the night ramp holds the contrast floors it was solved for", () => {
  const t = nightTokens();
  // Body text, on the darkest and the lightest surface it ever lands on.
  expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(7); // AAA
  expect(contrast(t.text, t.hover)).toBeGreaterThanOrEqual(4.5);
  // Secondary and tertiary text: AA for normal-size body text everywhere they are used.
  expect(contrast(t.muted, t.raised)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(t.subtle, t.raised)).toBeGreaterThanOrEqual(4.5);
  // `faint` is separator-only, so it answers to the 3:1 non-text floor instead.
  expect(contrast(t.faint, t.surface)).toBeGreaterThanOrEqual(3);
  // The ramp has to actually step: each surface must be lighter than the one below it.
  const ladder = ["shade", "bg", "surface", "raised", "hover", "border"];
  const lums = ladder.map((k) => relativeLuminance(t[k]));
  expect(lums).toEqual([...lums].sort((a, b) => a - b));
});

test("no component hard-codes a dark surface any more", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    // The two hexes and the slate steps this palette replaced. They are only ever
    // reintroduced by copy-paste, and each one is a colour that can no longer be
    // retuned from tailwind.config.js.
    for (const bad of src.match(/dark:[\w:-]*\[#[0-9A-Fa-f]{3,8}\]/g) ?? []) {
      offenders.push(`${file}: ${bad}`);
    }
    for (const bad of src.match(/dark:[\w:-]*(?:bg|text|border)-slate-\d{3}/g) ?? []) {
      offenders.push(`${file}: ${bad}`);
    }
  }
  expect(offenders).toEqual([]);
});
