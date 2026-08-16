import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { woff2Ligatures } from "./test/woff2Ligatures";

// The icon font is a frozen subset (see the block comment above the @font-face in
// src/index.css), and a name that is not in it does not fail: it renders as its own
// ligature text. The start pin shipped as the word "LOCATION_ON" drawn in red across the
// map, at 34px, because `location_on` was passed to a Pin and never added to the
// icon_names list.
//
// Nothing could have caught that. Rendering cannot: jsdom has no fonts, and even in a
// browser the fallback is legible text rather than a blank or a crash. So the check has
// to be static, and it has three links, each of which is a way to ship the same bug:
//
//   1. every glyph name used in src/ is in src/index.css's icon_names list,
//   2. every name in the list is still used by something,
//   3. every name in the list is actually present in the .woff2 on disk.
//
// (3) is the half that catches the other version of the mistake: editing the list and
// forgetting to regenerate the font, which leaves the URL in the comment describing a
// file that was never fetched. Reading the font is the only way to know; the byte size
// changing proves nothing.
//
// The list, the @font-face and the font file all moved out of index.html and public/ when
// the font became a hashed build asset. They are read from wherever they live now, and
// the point of reading them from one file is that the rule and the list it documents
// cannot drift apart.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FONT = join(HERE, "fonts", "material-symbols-rounded-subset.woff2");

const css = readFileSync(join(HERE, "index.css"), "utf8");

/** The icon_names list from the Google Fonts URL that generated the subset. */
function listedNames(): string[] {
  const url = css.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^\s]*/);
  expect(url, "no Google Fonts css2 URL in src/index.css").not.toBeNull();
  const names = url![0].match(/[?&]icon_names=([^&]+)/);
  expect(names, "the css2 URL in src/index.css has no icon_names parameter").not.toBeNull();
  return names![1].split(",");
}

function sourceFiles(): string[] {
  return readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .map((f) => join(ROOT, "src", f));
}

const NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function quoted(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter((s) => NAME.test(s));
}

/**
 * Every glyph name a source file hands to the icon font, with the line it is on.
 *
 * There is no type to lean on here — a glyph is a bare string all the way down — so
 * this is four deliberately narrow syntactic rules rather than one loose scan. A loose
 * scan is not an option: "cloud" and "sunny" are ordinary words, so any rule broad
 * enough to catch them by shape also catches "en", "start" and "walk".
 *
 * The rules are the four shapes the codebase actually uses. If a fifth appears, test 4
 * below is the one that notices, because a name reachable only through the new shape
 * stops being seen as used.
 */
function usedNames(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const add = (name: string, where: string) => {
    if (!NAME.test(name)) return;
    used.set(name, [...(used.get(name) ?? []), where]);
  };

  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    const where = relative(ROOT, file);

    // 1. The child of a <span class="material-symbols-rounded">. A bare word is the
    //    glyph itself; an expression contributes its string literals, so the ternary in
    //    App's theme toggle gives up both light_mode and dark_mode while
    //    NavigationOverlay's {glyph} correctly gives up nothing.
    for (const chunk of src.split("material-symbols-rounded").slice(1)) {
      const close = chunk.indexOf(">");
      const end = chunk.indexOf("</span>");
      if (close < 0 || end < close) continue;
      const child = chunk.slice(close + 1, end).trim();
      if (child.startsWith("{")) for (const s of quoted(child)) add(s, where);
      else add(child, where);
    }

    // 2. A literal icon="..." prop. This is how MapView's two Pins are set, and it is
    //    the shape the bug arrived in. Only the double-quoted attribute form counts:
    //    icon={...} is also leaflet's own prop, whose value is a divIcon object.
    for (const m of src.matchAll(/\bicon="([^"]*)"/g)) add(m[1], where);

    // 3. The values of a lookup table named GLYPH — NavigationOverlay's manoeuvre map.
    //    Named on GLYPH rather than on the Record type, which the POI tag maps also
    //    have, and whose values are OSM tags rather than glyph names.
    for (const m of src.matchAll(/\b\w*GLYPH\w*\s*:\s*Record<string,\s*string>\s*=\s*\{/g)) {
      const from = m.index + m[0].length;
      const to = src.indexOf("\n};", from);
      for (const s of quoted(src.slice(from, to < 0 ? undefined : to))) add(s, where);
    }

    // 4. The first argument of a function whose first parameter is named `icon`: a
    //    parameter with that name receives glyph names. This is weatherIcons' look(),
    //    where the glyph is chosen by WMO code. Only the first argument is read, up to
    //    the first comma at bracket depth zero, so `look(isDay ? "sunny" : "bedtime",
    //    "weatherClear", lang)` yields the two glyphs and not the translation key.
    for (const fn of src.matchAll(/\bfunction\s+(\w+)\s*\(\s*icon\b/g)) {
      for (const call of src.matchAll(new RegExp(`\\b${fn[1]}\\(`, "g"))) {
        let depth = 0;
        let i = call.index + call[0].length;
        const from = i;
        for (; i < src.length; i += 1) {
          const c = src[i];
          if (c === "(" || c === "[" || c === "{") depth += 1;
          else if (c === ")" || c === "]" || c === "}") {
            if (depth === 0) break;
            depth -= 1;
          } else if (c === "," && depth === 0) break;
        }
        for (const s of quoted(src.slice(from, i))) add(s, where);
      }
    }
  }
  return used;
}

test("every glyph the app renders is in the icon_names list the font was subset from", () => {
  const listed = new Set(listedNames());
  const missing = [...usedNames()]
    .filter(([name]) => !listed.has(name))
    .map(([name, where]) => `${name} (${[...new Set(where)].join(", ")})`);
  // A name here renders as its own text at the icon's size and colour. Add it to the
  // icon_names list in src/index.css, keeping the list alphabetical, then regenerate
  // src/fonts/material-symbols-rounded-subset.woff2 from the URL in that comment.
  expect(missing).toEqual([]);
});

test("nothing in the icon_names list is dead weight", () => {
  const used = usedNames();
  // Every name costs bytes in a font every visitor downloads before the first paint,
  // and font-display: block means they wait for it.
  expect(listedNames().filter((name) => !used.has(name))).toEqual([]);
});

test("the icon_names list is alphabetical, which the Google Fonts API requires", () => {
  const listed = listedNames();
  // Out of order, the API answers with a subset that silently omits glyphs.
  expect(listed).toEqual([...listed].sort());
});

test("the scanner still reaches all four places a glyph name is written", () => {
  const used = usedNames();
  // Test 1 can be satisfied by a scanner that finds nothing, and test 2 by deleting
  // names from the list. This is the canary for both: one name per rule, each only
  // reachable through the rule it stands for.
  expect(used.has("close")).toBe(true); // bare JSX child
  expect(used.has("dark_mode")).toBe(true); // string literal in a JSX expression child
  expect(used.has("location_on")).toBe(true); // icon="..." on a Pin
  expect(used.has("roundabout_right")).toBe(true); // NavigationOverlay's GLYPH map
  expect(used.has("weather_snowy")).toBe(true); // weatherIcons' look()
  expect(used.get("location_on")).toContain("src/components/MapView.tsx");
});

test("the subsetted font on disk actually contains every listed glyph", () => {
  // Parsed out of the woff2's own cmap and GSUB tables, not inferred from its size:
  // a list edited without regenerating the font leaves the file byte-identical, and
  // a regeneration from a mistyped URL leaves it a different size but still wrong.
  const ligatures = woff2Ligatures(FONT);
  expect(listedNames().filter((name) => !ligatures.has(name))).toEqual([]);
});
