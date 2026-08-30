// The layout gate.
//
// Why this exists at all: the unit suite runs in jsdom, which parses HTML and runs
// JavaScript but never lays anything out. Every box in it is 0x0 at (0,0). A test there
// can prove that the string "w-full" was written into a class attribute; it cannot prove
// the element is a pixel wide, on screen, in front, or reachable by a finger — and the
// defect this whole unit exists to fix was a width. Six one-line changes that each ship
// a visibly broken search screen (the sheet moved off screen, collapsed to zero width,
// sent behind the page, made untouchable, the suggestion list clamped back to 63px, the
// entry button clamped to a chip) passed all 314 jsdom tests.
//
// So this layer asserts geometry instead of markup: getBoundingClientRect, computed
// style and elementFromPoint, in a real Chrome at real device metrics with touch
// emulation. It is a separate command on purpose — `npm run check` and the pre-commit
// hook run on every commit and must not need a browser. `npm run test:browser` is where
// the browser is required, and CI runs it as its own step.
//
//   npm run test:browser                  # all specs
//   npm run test:browser -- --filter=sheet   # scenarios whose name matches
//   FOV_KEEP_SHOTS=1 npm run test:browser # leave screenshots in browser-tests/shots

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp } from "./lib/serve.mjs";
import { launch, Page } from "./lib/chrome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, "shots");

const filter = (process.argv.find((a) => a.startsWith("--filter=")) ?? "").slice(9);

// A scenario's assertions. Each one carries the numbers it was decided on, because the
// number is the evidence: "entry button 63px wide, needs 331" says what broke, where
// "expected true" says only that something did.
class Checks {
  constructor(scenario) {
    this.scenario = scenario;
    this.results = [];
  }

  record(pass, label, detail) {
    this.results.push({ pass, label, detail });
    return pass;
  }

  ok(label, pass, detail = "") {
    return this.record(Boolean(pass), label, detail);
  }

  // actual must equal expected exactly (integers: geometry that should line up).
  equal(label, actual, expected, detail = "") {
    return this.record(
      actual === expected,
      label,
      `expected ${expected}, got ${actual}${detail ? ` — ${detail}` : ""}`,
    );
  }

  near(label, actual, expected, tolerance, detail = "") {
    return this.record(
      Math.abs(actual - expected) <= tolerance,
      label,
      `expected ${expected} ±${tolerance}, got ${round(actual)}${detail ? ` — ${detail}` : ""}`,
    );
  }

  atLeast(label, actual, min, detail = "") {
    return this.record(
      actual >= min,
      label,
      `expected at least ${round(min)}, got ${round(actual)}${detail ? ` — ${detail}` : ""}`,
    );
  }

  atMost(label, actual, max, detail = "") {
    return this.record(
      actual <= max,
      label,
      `expected at most ${round(max)}, got ${round(actual)}${detail ? ` — ${detail}` : ""}`,
    );
  }
}

function round(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : n;
}

async function main() {
  const started = Date.now();
  const specs = fs
    .readdirSync(path.join(HERE, "specs"))
    // `.checks.mjs`, not `.spec.mjs`: vitest's default glob collects **/*.spec.* and
    // would try to run these as unit tests, where there is no browser to run them in.
    .filter((f) => f.endsWith(".checks.mjs"))
    .sort();

  const app = await serveApp();
  const chrome = await launch();
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const all = [];
  let hardFailures = 0;

  try {
    for (const file of specs) {
      const mod = await import(path.join(HERE, "specs", file));
      for (const scenario of mod.scenarios) {
        if (filter && !scenario.name.toLowerCase().includes(filter.toLowerCase())) continue;
        const checks = new Checks(scenario.name);
        const ctx = {
          checks,
          url: app.url,
          shots: SHOTS,
          openPhone: (opts) => Page.open(chrome.browser, opts),
        };
        process.stdout.write(`\n  ${scenario.name}\n`);
        try {
          await scenario.run(ctx);
        } catch (e) {
          hardFailures++;
          checks.record(false, "scenario ran to the end", `threw: ${e.message}`);
        }
        for (const r of checks.results) {
          process.stdout.write(
            r.pass ? `    ok   ${r.label}${r.detail ? `  [${r.detail}]` : ""}\n` : `    FAIL ${r.label}\n         ${r.detail}\n`,
          );
        }
        all.push({ scenario: scenario.name, results: checks.results });
      }
    }
  } finally {
    await chrome.close();
    await app.close();
    if (!process.env.FOV_KEEP_SHOTS) fs.rmSync(SHOTS, { recursive: true, force: true });
  }

  const flat = all.flatMap((s) => s.results);
  const failed = flat.filter((r) => !r.pass);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  process.stdout.write(`\n${"-".repeat(72)}\n`);
  if (failed.length === 0) {
    process.stdout.write(`browser layout: ${flat.length} assertions passed in ${seconds}s\n`);
    return 0;
  }
  process.stdout.write(`browser layout: ${failed.length} of ${flat.length} assertions FAILED in ${seconds}s\n\n`);
  for (const s of all) {
    for (const r of s.results) {
      if (!r.pass) process.stdout.write(`  FAIL  ${s.scenario}\n        ${r.label}\n        ${r.detail}\n\n`);
    }
  }
  if (hardFailures) process.stdout.write(`  (${hardFailures} scenario(s) threw before finishing)\n`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`\nbrowser layout could not run:\n${e.stack ?? e}\n`);
    process.exit(2);
  },
);
