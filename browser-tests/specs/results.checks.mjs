// The results screen, measured.
//
// What this file is about: the advice is the product, and until this pass it was drawn
// as three 120px cards in a horizontal scroller with the itinerary somewhere below
// them. A recon with real device metrics found that on a 360px phone the third card
// began 64px past the row's clip, so a finger aimed at its middle reached the results
// panel behind it; that four stacked metric lines made every card 194.5px, taller than
// the whole visible results column in landscape; and that the option titles were cut to
// "Openbaar ver...". Every assertion below is a number off getBoundingClientRect,
// getComputedStyle or elementFromPoint. None of them names a class.
//
// The shape they pin is the one Google Maps and Airbnb use on a phone: full-width rows,
// stacked, each tappable across its whole width, with the chosen one and its itinerary
// forming a single block instead of a card above a list.

import { sleep } from "../lib/chrome.mjs";
import {
  PROBE,
  TRIP_SEED,
  OPTION,
  OPTION_BUTTON,
  OPTION_LIST,
  OPTION_DETAILS,
  OPTION_METRICS,
  OPTION_STEPS,
  STEPS_TOGGLE,
  COLUMN,
} from "../lib/measure.mjs";

const AA = 4.5; // WCAG AA for text below 18px / 14px bold, which is all of this.

// The phone viewports every geometry question here is asked at, and both languages.
// Dutch is the longer of the two and is what clipped the titles.
//
// 320 is the narrowest screen still sold (an SE in portrait, or any phone at the largest
// text size). The map-chrome file has always visited it; this one stopped at 360, so the
// narrowest phone had no arrival assertion at all — it passes today (one whole row and
// 91% of the second), which is the reason to pin it rather than to leave it to luck.
const PHONES = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
];
const LANGS = ["en", "nl"];

async function bootResults(ctx, { width, height, theme = "light", lang = "en" }) {
  const page = await ctx.openPhone({ width, height, theme, lang, seed: TRIP_SEED });
  await page.goto(ctx.url);
  await page.waitFor(`document.querySelector('[data-fov="search-pill"]')`, {
    label: "the app to render its search pill",
  });
  await page.eval(PROBE);
  // Planned by touching the seeded recent trip on the home, which is the same path a
  // user takes: the results are then whatever the app really renders for that trip.
  const row = await page.eval(`
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Zuidplein"));
    if (!b) return null;
    window.__fov.reveal(b);
    return window.__fov.rect(b);
  `);
  if (!row) throw new Error("the seeded recent trip is not on the home screen");
  await page.tap(row.x + row.w / 2, row.y + row.h / 2);
  await page.waitFor(`document.querySelectorAll('${OPTION}').length >= 3`, {
    label: "three travel options",
  });
  await sleep(900); // the morph, and the map chunk settling under it
  await page.eval(PROBE);
  return page;
}

// The chosen option's steps are folded on a phone (they are 372px of itinerary sitting
// between option 1 and option 2, which is why they are). Anything that measures what is
// inside them has to open them first, and opening them by touch is itself the check
// that the fold is a fold and not a hole.
async function openSteps(page) {
  const t = await page.eval(`
    const F = window.__fov;
    const d = document.querySelector('${OPTION_STEPS}');
    if (!d) return { present: false, open: true };
    const s = d.querySelector('${STEPS_TOGGLE}');
    F.reveal(s);
    const b = F.rect(s);
    return { present: true, open: d.open, x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) };
  `);
  if (!t.present || t.open) return t;
  await page.tap(t.x, t.y);
  await sleep(300);
  return t;
}

// Every option row, with the list and the column that hold them.
const readRows = `
  const F = window.__fov;
  const list = document.querySelector('${OPTION_LIST}');
  const column = document.querySelector('${COLUMN}');
  const rows = [...document.querySelectorAll('${OPTION}')].map((li) => {
    const btn = li.querySelector('${OPTION_BUTTON}');
    const details = li.querySelector('${OPTION_DETAILS}');
    const title = li.querySelector('[data-fov="option-title"]');
    return {
      box: F.rect(li),
      button: F.rect(btn),
      details: details ? F.rect(details) : null,
      selected: li.getAttribute("data-selected") === "true",
      pressed: btn.getAttribute("aria-pressed"),
      expanded: btn.getAttribute("aria-expanded"),
      title: { text: title.textContent, scrollWidth: title.scrollWidth, clientWidth: title.clientWidth },
    };
  });
  return {
    rows,
    list: { ...F.rect(list), scrollWidth: list.scrollWidth, clientWidth: list.clientWidth,
            overflowX: getComputedStyle(list).overflowX },
    column: { ...F.rect(column), clientHeight: column.clientHeight, scrollHeight: column.scrollHeight },
    iw: innerWidth, ih: innerHeight,
  };
`;

export const scenarios = [
  {
    // The unit's own load-bearing constraint: fare, calories, CO2 and rain stay on
    // every option row on a phone, with their meaning, in both languages. It had no
    // test. Deleting the fare from the phone with `hidden sm:flex` left all 330 unit
    // tests and all 143 assertions in this layer green, while the figure was
    // `display: none` at width 0 on both phone viewports and back at 1280.
    //
    // The one check that touched the figures counted `li` elements, which a hidden
    // element satisfies — the "assert existence rather than usability" pattern this
    // whole layer exists to end, reproduced inside it. So this asks whether the four
    // are PAINTED: a computed display, a box with width, a hit test at the figure's own
    // centre landing on it, and the four meanings present in the row's rendered text
    // (innerText, not textContent — innerText is what is laid out).
    name: "phones the four figures are painted on every option row, in both languages",
    async run(ctx) {
      const { checks } = ctx;
      for (const { width, height } of PHONES) {
        for (const lang of LANGS) {
          const at = `${width}x${height} ${lang}`;
          const page = await bootResults(ctx, { width, height, lang });
          try {
            const rows = await page.eval(`
              const F = window.__fov;
              return [...document.querySelectorAll('${OPTION}')].map((li) => {
                const btn = li.querySelector('${OPTION_BUTTON}');
                const list = li.querySelector('${OPTION_METRICS}');
                // The figures, not the row: a chosen row carries its itinerary too, and
                // centring all of that would push the line being measured off screen
                // for reasons that have nothing to do with the figures.
                F.reveal(list);
                return {
                  title: li.querySelector('[data-fov="option-title"]').textContent.trim(),
                  text: btn.innerText,
                  figures: [...list.querySelectorAll("li")].map((x) => F.shown(x)),
                };
              });
            `);
            checks.equal(`${at}: three options are rendered`, rows.length, 3);
            for (const [i, r] of rows.entries()) {
              checks.equal(
                `${at}: option ${i + 1} ("${r.title}") carries four figures`,
                r.figures.length,
                4,
                r.figures.map((f) => f.text).join(" | "),
              );
              for (const [j, f] of r.figures.entries()) {
                checks.ok(
                  `${at}: option ${i + 1} figure ${j + 1} ("${f.text}") is painted`,
                  f.painted,
                  `display ${f.display}, ${round(f.w)}x${round(f.h)} at (${f.x}, ${f.y}), ` +
                    `hit test found ${f.hit}, rendered ${f.rendered}`,
                );
                checks.atLeast(
                  `${at}: option ${i + 1} figure ${j + 1} ("${f.text}") has width`,
                  f.w,
                  1,
                  `${round(f.w)}px wide, display ${f.display}`,
                );
              }
              // And the four meanings, off what is actually laid out. A row that lost
              // one of them reads "·\n152 kcal\n·\n0 g CO2\n·\nNo rain", orphaned
              // separator and all.
              for (const [what, re] of [
                ["a fare", /€|Free|Gratis|No estimate|Geen schatting/],
                ["calories", /kcal/],
                ["CO2", /CO2/],
                ["rain", /rain|regen/i],
              ]) {
                checks.ok(
                  `${at}: option ${i + 1} ("${r.title}") still says ${what}`,
                  re.test(r.text),
                  `row text ${JSON.stringify(r.text)}`,
                );
              }
            }
          } finally {
            await page.close();
          }
        }
      }
    },
  },

  {
    // Where the rows sit when the plan lands, measured before anything is scrolled.
    //
    // Every other assertion in this file calls reveal() first, so none of them ever
    // asked the question a rider asks: is an option on screen? It was not. At 390x844
    // the results column is 340px tall and the weather strip plus the advice banner
    // used to take 219.5 of it, which left 52.9px of the first row visible and nothing
    // of the other two — 26.5px at 360x800 — with the chosen option's 372px itinerary
    // sitting between row 1 and row 2, so reaching option 2 cost 416px of scrolling and
    // option 3, 513px. Nothing here scrolls: this is the arrival state.
    name: "phones when the plan lands the option rows are already on screen",
    async run(ctx) {
      const { checks } = ctx;
      // 844x390 is the same question turned sideways. F4 pinned the landscape column's
      // *size* — two thirds of the screen — and never asked what was inside it on
      // arrival; the answer used to be one row and 30% of the second, because the
      // weather strip spent 55 of the column's 262px. The strip now stays out of the
      // sideways column (the forecast lives in the banner under the list there), and
      // this is the assertion that keeps it out. Portrait asks in English as before;
      // the sideways run asks in both languages, since Dutch rows are the wider ones.
      const ARRIVALS = [
        ...PHONES.map((p) => ({ ...p, langs: ["en"] })),
        { width: 844, height: 390, langs: LANGS },
      ];
      for (const { width, height, langs } of ARRIVALS) {
      for (const lang of langs) {
        const sideways = width > height;
        const at = sideways ? `${width}x${height} ${lang}` : `${width}x${height}`;
        const page = await bootResults(ctx, { width, height, lang });
        try {
          // The forecast arrives on its own schedule and, on portrait, takes room above
          // the list — so the arrival state is measured once the strip is there rather
          // than before. Sideways there is no strip to wait for.
          if (!sideways) {
            await page.waitFor(`document.querySelector('[data-fov="weather-strip"]')`, {
              label: "the weather strip to settle above the options",
              timeout: 5000,
            }).catch(() => {});
          }
          await sleep(200);
          const m = await page.eval(`
            const F = window.__fov;
            const col = document.querySelector('${COLUMN}');
            const list = document.querySelector('${OPTION_LIST}');
            const c = col.getBoundingClientRect();
            return {
              strip: !!document.querySelector('[data-fov="weather-strip"]'),
              scrolled: col.scrollTop,
              col: { top: +c.top.toFixed(2), bottom: +c.bottom.toFixed(2), h: +c.height.toFixed(2) },
              aboveFirstRow: +(list.getBoundingClientRect().top - c.top + col.scrollTop).toFixed(2),
              rows: [...document.querySelectorAll('${OPTION}')].map((li) => {
                const r = li.getBoundingClientRect();
                const visible = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
                return { h: +r.height.toFixed(2), top: +r.top.toFixed(2),
                         visible: +visible.toFixed(2), frac: +(visible / r.height).toFixed(3),
                         selected: li.getAttribute("data-selected") === "true" };
              }),
            };
          `);
          checks.equal(`${at}: the column has not been scrolled`, m.scrolled, 0);
          // The budget for everything drawn above the first option.
          checks.atMost(
            `${at}: under 90px sits above the first option row`,
            m.aboveFirstRow,
            90,
            `${round(m.aboveFirstRow)}px above the list; it was 219.5px (strip 85.5 + banner 102)`,
          );
          const whole = m.rows.filter((r) => r.visible >= r.h - 0.5);
          checks.atLeast(
            `${at}: at least one whole option row is inside the visible column`,
            whole.length,
            1,
            m.rows
              .map((r, i) => `option ${i + 1}: ${round(r.visible)} of ${round(r.h)}px`)
              .join(", ") + ` in a ${round(m.col.h)}px column`,
          );
          const halfway = m.rows.filter((r) => r.frac >= 0.5);
          checks.atLeast(
            `${at}: at least two option rows are half on screen or better`,
            halfway.length,
            2,
            m.rows.map((r, i) => `option ${i + 1}: ${pct(r.frac)}`).join(", ") +
              (width === 390 ? " (it was 11.5%, 0%, 0%)" : width === 360 ? " (it was 5.7%, 0%, 0%)" : ""),
          );
          if (sideways) {
            // The one product change behind these numbers: the 55px strip is what stood
            // between the sideways rider and the second row (27/89 with it, 89/89
            // without). If it comes back, fail by name, not just by a smaller fraction.
            checks.equal(
              `${at}: the weather strip stays out of the sideways column`,
              m.strip,
              false,
              "its 55px is the second row's visibility; the forecast is in the banner under the list",
            );
          }
        } finally {
          await page.close();
        }
      }
      }
    },
  },

  {
    name: "360x800 the options are full-width rows with nothing outside the clip",
    async run(ctx) {
      const { checks } = ctx;
      // The small Android is the viewport the old row failed on: 376px of cards in a
      // 312px box, so the third one ran 64px past the edge.
      const page = await bootResults(ctx, { width: 360, height: 800 });
      try {
        const m = await page.eval(readRows);
        checks.equal("three options are rendered", m.rows.length, 3);
        checks.equal(
          "the option list has nothing hidden sideways",
          m.list.scrollWidth,
          m.list.clientWidth,
          `scrollWidth ${m.list.scrollWidth} against clientWidth ${m.list.clientWidth} ` +
            `(overflow-x "${m.list.overflowX}")`,
        );
        for (const [i, r] of m.rows.entries()) {
          checks.atLeast(
            `option ${i + 1} spans the results column`,
            r.box.w,
            0.9 * m.list.w,
            `row ${round(r.box.w)}px of a ${round(m.list.w)}px list (${pct(r.box.w / m.list.w)})`,
          );
          checks.atMost(
            `option ${i + 1} ends inside the list, not past it`,
            r.box.right,
            m.list.right + 0.5,
            `row right edge ${round(r.box.right)}, list right edge ${round(m.list.right)}`,
          );
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "360x800 a tap at the far end of the last option selects it",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 360, height: 800 });
      try {
        // The last row is the one that used to be 64px off the clip. The probe is at
        // its trailing end, which is the half a clipped card loses first, and it is a
        // real touch: elementFromPoint agreeing is not the same as the app reacting.
        const target = await page.eval(`
          const F = window.__fov;
          const rows = [...document.querySelectorAll('${OPTION}')];
          const last = rows[rows.length - 1];
          F.reveal(last);
          const btn = last.querySelector('${OPTION_BUTTON}');
          const b = F.rect(btn);
          const x = Math.round(b.right - 12), y = Math.round(b.y + b.h / 2);
          return { b, x, y, hit: F.hit(x, y, '${OPTION_BUTTON}'),
                   wasSelected: last.getAttribute("data-selected") === "true",
                   title: last.querySelector('[data-fov="option-title"]').textContent };
        `);
        checks.ok(
          "the last option's trailing end is on screen",
          target.b.y + target.b.h / 2 > 0 && target.b.y + target.b.h / 2 < 800,
          `row at y=${round(target.b.y)} height ${round(target.b.h)}`,
        );
        checks.ok(
          "a touch at the far end of the last option reaches that option",
          target.hit.inside,
          `elementFromPoint(${target.x}, ${target.y}) = ${target.hit.desc} "${target.hit.text}"`,
        );
        checks.ok("the last option is not already the selected one", !target.wasSelected, target.title);

        await page.tap(target.x, target.y);
        await sleep(400);
        const after = await page.eval(`
          const rows = [...document.querySelectorAll('${OPTION}')];
          const last = rows[rows.length - 1];
          return { selected: last.getAttribute("data-selected") === "true",
                   pressed: last.querySelector('${OPTION_BUTTON}').getAttribute("aria-pressed"),
                   hasDetails: !!last.querySelector('${OPTION_DETAILS}'),
                   selectedCount: rows.filter((r) => r.getAttribute("data-selected") === "true").length };
        `);
        checks.ok("the tap selected the last option", after.selected, `aria-pressed ${after.pressed}`);
        checks.ok("the selected option opened its itinerary", after.hasDetails, `details present: ${after.hasDetails}`);
        checks.equal("exactly one option is selected", after.selectedCount, 1);
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 an option row is short enough to read at a glance",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 390, height: 844 });
      try {
        const m = await page.eval(readRows);
        // The unselected rows are the comparison; the selected one carries the whole
        // itinerary and is meant to be tall.
        const collapsed = m.rows.filter((r) => !r.selected);
        for (const [i, r] of collapsed.entries()) {
          checks.atMost(
            `an unopened option ${i + 1} is at most 120px tall`,
            r.box.h,
            120,
            `${round(r.box.h)}px (it was 194.5px as a card)`,
          );
          checks.atMost(
            `an unopened option ${i + 1} takes under half the visible results column`,
            r.box.h / m.column.h,
            0.5,
            `${round(r.box.h)}px of a ${round(m.column.h)}px column (${pct(r.box.h / m.column.h)})`,
          );
        }
        // Every row has to clear a finger as well as fit one.
        for (const [i, r] of m.rows.entries()) {
          checks.atLeast(`option ${i + 1} clears a 44px finger`, r.button.h, 44, `${round(r.button.h)}px`);
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "844x390 a whole option row fits the landscape results column",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 844, height: 390 });
      try {
        const m = await page.eval(readRows);
        // Half a landscape phone used to be gone before the results began: 52.8% of a
        // 390px screen was header, pill, map-stage padding and filter bar. The first
        // pass moved that to 49.74% — inside a 50% threshold by 2.3px, which is not a
        // margin. The chrome above the content is sized for a portrait phone and has no
        // business being that tall here, so on a short viewport the header is a 48px
        // bar, the pill loses a padding step and the stage's headroom follows both down.
        checks.atMost(
          "the results column starts in the top 45% of the screen",
          m.column.top / m.ih,
          0.45,
          `column starts at y=${round(m.column.top)} of ${m.ih} (${pct(m.column.top / m.ih)}); ` +
            `it was 206 (52.8%), then 194 (49.7%)`,
        );
        const tallest = Math.max(...m.rows.filter((r) => !r.selected).map((r) => r.box.h));
        checks.atMost(
          "an unopened option is shorter than the results column",
          tallest,
          m.column.clientHeight,
          `tallest row ${round(tallest)}px, column ${m.column.clientHeight}px ` +
            `(${pct(tallest / m.column.clientHeight)}); it was 194.5px in a 160px column`,
        );
        // And it can actually be brought fully into view, which is the thing the user
        // was denied: at 121.6% of the column every card was cut whatever they did.
        const shown = await page.eval(`
          const F = window.__fov;
          const rows = [...document.querySelectorAll('${OPTION}')].filter((r) => r.getAttribute("data-selected") !== "true");
          const col = document.querySelector('${COLUMN}');
          F.reveal(rows[0]);
          const r = rows[0].getBoundingClientRect(), c = col.getBoundingClientRect();
          return { rowTop: +r.top.toFixed(2), rowBottom: +r.bottom.toFixed(2),
                   colTop: +c.top.toFixed(2), colBottom: +c.bottom.toFixed(2),
                   visible: +(Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)).toFixed(2),
                   height: +r.height.toFixed(2) };
        `);
        checks.near(
          "scrolled to, an option row is visible end to end",
          shown.visible,
          shown.height,
          1,
          `${round(shown.visible)}px of a ${round(shown.height)}px row inside a column ` +
            `spanning y=${round(shown.colTop)}..${round(shown.colBottom)}`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 the chosen option and its itinerary are one block",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 390, height: 844 });
      try {
        const m = await page.eval(readRows);
        const sel = m.rows.find((r) => r.selected);
        checks.ok("one option is selected", sel != null, `${m.rows.filter((r) => r.selected).length} selected`);
        if (!sel) return;
        checks.ok("the selected option carries the itinerary", sel.details != null, "no details panel inside it");
        if (!sel.details) return;
        checks.ok("the selected option says it is expanded", sel.expanded === "true", `aria-expanded ${sel.expanded}`);
        // Continuous: the itinerary starts exactly where the row ends, and the two
        // share the block's left and right edges. A card floating below a list of
        // cards is what this replaced.
        checks.near(
          "the itinerary starts where the option row ends",
          sel.details.top,
          sel.button.bottom,
          1.5,
          `row ends at y=${round(sel.button.bottom)}, itinerary starts at y=${round(sel.details.top)}`,
        );
        checks.near(
          "the itinerary is as wide as the option it belongs to",
          sel.details.w,
          sel.button.w,
          1,
          `itinerary ${round(sel.details.w)}px, row ${round(sel.button.w)}px`,
        );
        checks.near(
          "the block is exactly the row plus its itinerary",
          sel.box.h,
          sel.button.h + sel.details.h,
          3,
          `block ${round(sel.box.h)}px against row ${round(sel.button.h)} + itinerary ${round(sel.details.h)}`,
        );
        // On a phone the steps start folded, and the departure line doubles as the
        // disclosure that opens them. Touching it is what the rest of this measures:
        // the fold has to be a fold, not a hole.
        const folded = await page.eval(`
          const F = window.__fov;
          const d = document.querySelector('${OPTION_STEPS}');
          if (!d) return null;
          const s = d.querySelector('${STEPS_TOGGLE}');
          const b = F.rect(s);
          const itin = document.querySelector('[data-fov="itinerary"]');
          return { open: d.open, toggle: b, shown: F.shown(s), steps: F.shown(itin) };
        `);
        checks.ok("the chosen option's steps start folded on a phone", folded != null && folded.open === false,
          folded ? `open ${folded.open}` : "no steps disclosure on this viewport");
        if (folded) {
          checks.atLeast("the disclosure that opens them clears a 44px finger", folded.toggle.h, 44,
            `${round(folded.toggle.w)}x${round(folded.toggle.h)}`);
          checks.ok("the disclosure is painted", folded.shown.painted,
            `display ${folded.shown.display}, ${round(folded.shown.w)}x${round(folded.shown.h)}, hit ${folded.shown.hit}`);
          // Chrome lays a closed <details> out and skips painting it, so the steps
          // still have a 316x233 box: `rendered` (checkVisibility) is the half of this
          // that a rect cannot answer.
          checks.ok("nothing of the folded itinerary is on the screen",
            !folded.steps.rendered && !folded.steps.painted,
            `steps rendered ${folded.steps.rendered}, painted ${folded.steps.painted}, ` +
              `box ${round(folded.steps.w)}x${round(folded.steps.h)}`);
        }
        await openSteps(page);

        // And the steps themselves are in there, once, inside the selected block —
        // not a second panel hanging under the list.
        const steps = await page.eval(`
          const F = window.__fov;
          const all = [...document.querySelectorAll('[data-fov="itinerary"]')];
          const inside = all.filter((d) => d.closest('${OPTION}[data-selected="true"]'));
          const outside = all.filter((d) => !d.closest('${OPTION}'));
          const shown = inside[0] ? F.shown(inside[0]) : null;
          return { total: all.length, inside: inside.length, outside: outside.length,
                   box: inside[0] ? F.rect(inside[0]) : null, shown,
                   block: F.rect(document.querySelector('${OPTION}[data-selected="true"]')) };
        `);
        checks.equal("exactly one itinerary is drawn", steps.total, 1);
        checks.equal("it is inside the option it belongs to", steps.inside, 1);
        checks.equal("none is drawn outside an option", steps.outside, 0);
        if (steps.shown) {
          checks.ok(
            "opening the disclosure puts the steps on the screen",
            steps.shown.painted,
            `display ${steps.shown.display}, ${round(steps.shown.w)}x${round(steps.shown.h)}, hit ${steps.shown.hit}`,
          );
        }
        if (steps.box) {
          checks.ok(
            "the steps sit within the chosen option's own box",
            steps.box.top >= steps.block.top - 1 && steps.box.bottom <= steps.block.bottom + 1,
            `steps span y=${round(steps.box.top)}..${round(steps.box.bottom)}, ` +
              `block spans y=${round(steps.block.top)}..${round(steps.block.bottom)}`,
          );
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "360x800 nl option titles are not clipped",
    async run(ctx) {
      const { checks } = ctx;
      // Dutch is the longer language: "Openbaar vervoer" was 114px of title in an 80px
      // box, so the word naming the option was cut to "Openbaar ver...".
      const page = await bootResults(ctx, { width: 360, height: 800, lang: "nl" });
      try {
        const m = await page.eval(readRows);
        for (const r of m.rows) {
          checks.atMost(
            `the title "${r.title.text}" fits its box`,
            r.title.scrollWidth,
            r.title.clientWidth,
            `scrollWidth ${r.title.scrollWidth} against clientWidth ${r.title.clientWidth}`,
          );
        }
        checks.ok(
          "the Dutch titles are the Dutch ones",
          m.rows.some((r) => /vervoer|fiets/i.test(r.title.text)),
          m.rows.map((r) => r.title.text).join(", "),
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "360x800 the Best badge does not break the minutes onto two lines",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 360, height: 800 });
      try {
        const lines = await page.eval(`
          const F = window.__fov;
          return [...document.querySelectorAll('${OPTION_BUTTON}')].map((btn) => {
            const el = [...btn.querySelectorAll("span")].find((s) => /^\\d+ min$/.test(s.textContent.trim()));
            const cs = getComputedStyle(el);
            return { text: el.textContent.trim(), h: +el.getBoundingClientRect().height.toFixed(2),
                     lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
                     badge: !!btn.querySelector('[data-fov="option-title"] ~ span') };
          });
        `);
        for (const l of lines) {
          checks.atMost(
            `"${l.text}" stays on one line`,
            l.h,
            l.lineHeight * 1.6,
            `${round(l.h)}px against a ${round(l.lineHeight)}px line — two lines would be ${round(l.lineHeight * 2)}`,
          );
        }
        // The badge used to add its 28px to every row, because the row was a flex
        // container: all three grew when one of them wrapped.
        const heights = (await page.eval(readRows)).rows.filter((r) => !r.selected).map((r) => r.box.h);
        checks.atMost(
          "the unopened rows are all the same height",
          Math.max(...heights) - Math.min(...heights),
          1,
          `heights ${heights.map(round).join(", ")}`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 night every figure on the chosen option clears AA",
    async run(ctx) {
      const { checks } = ctx;
      // The old selected card was white-on-emerald-600: 3.14:1 for the four figures,
      // 3.77:1 for the title, 2.86:1 for the badge. The least legible text on the
      // screen was on the option the user had actually chosen.
      const page = await bootResults(ctx, { width: 390, height: 844, theme: "dark", lang: "nl" });
      try {
        const c = await page.eval(`
          const F = window.__fov;
          const li = document.querySelector('${OPTION}[data-selected="true"]');
          const btn = li.querySelector('${OPTION_BUTTON}');
          const metrics = [...li.querySelectorAll('[data-fov="option-metrics"] li')];
          const badge = [...btn.querySelectorAll("span")].find((s) => /^(Best|Beste)$/.test(s.textContent.trim()));
          const minutes = [...btn.querySelectorAll("span")].find((s) => /^\\d+ min$/.test(s.textContent.trim()));
          return {
            title: F.contrast(li.querySelector('[data-fov="option-title"]')),
            minutes: F.contrast(minutes),
            summary: F.contrast(li.querySelector('[data-fov="option-summary"]')),
            metrics: metrics.map((m) => ({ ...F.contrast(m), painted: F.shown(m).painted, w: F.shown(m).w })),
            badge: badge ? F.contrast(badge) : null,
            departure: F.contrast(li.querySelector('${OPTION_DETAILS} [data-fov="departure"]')),
          };
        `);
        // Four, and four that are on the screen. The count on its own was the only
        // guard this file had on the figures, and `display: none` satisfies a count.
        checks.equal("the metric line still carries four figures", c.metrics.length, 4);
        for (const [i, m] of c.metrics.entries()) {
          checks.ok(
            `figure ${i + 1} ("${m.text}") is painted on the chosen option`,
            m.painted,
            `${round(m.w)}px wide`,
          );
        }
        const named = [
          ["title", c.title],
          ["minutes", c.minutes],
          ["route summary", c.summary],
          ["departure line", c.departure],
          ...c.metrics.map((m, i) => [`figure ${i + 1} ("${m.text}")`, m]),
          ...(c.badge ? [["the Best badge", c.badge]] : []),
        ];
        for (const [label, m] of named) {
          checks.atLeast(
            `${label} on the chosen option clears AA`,
            m.ratio,
            AA,
            `${m.ratio}:1 — ${m.fg} on ${m.bg} at ${m.px}px/${m.weight}`,
          );
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 the estimates disclosure is a 44px target",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 390, height: 844 });
      try {
        // It lives inside the itinerary, which is folded on a phone.
        await openSteps(page);
        const t = await page.eval(`
          const F = window.__fov;
          const s = document.querySelector('[data-fov="estimates-toggle"]');
          F.reveal(s);
          const b = F.rect(s);
          return { b, open: s.closest("details").open, contrast: F.contrast(s),
                   minHeight: parseFloat(getComputedStyle(s).minHeight) || 0,
                   hit: F.hit(Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2), 'summary') };
        `);
        checks.atLeast("the disclosure clears a 44px finger", t.b.h, 44, `${round(t.b.w)}x${round(t.b.h)}, was 308x16`);
        // The box alone is not enough evidence. Taken literally, the mutation that
        // removed the minimum from this row left it 48px tall anyway, because the
        // inline chevron beside the label wrapped onto a second line and propped it up:
        // a 16px control that measures 48 because it is broken in a second way. The
        // floor has to be asserted where it is declared as well as where it lands.
        checks.atLeast(
          "the disclosure declares a 44px minimum, not just measures one",
          t.minHeight,
          44,
          `computed min-height ${t.minHeight}px against a measured ${round(t.b.h)}px box`,
        );
        checks.atLeast("the disclosure is at least 44px wide", t.b.w, 44, `${round(t.b.w)}px`);
        checks.ok("a tap at its centre reaches the disclosure", t.hit.inside, `hit ${t.hit.desc}`);
        checks.atLeast("its label clears AA", t.contrast.ratio, AA, `${t.contrast.ratio}:1 at ${t.contrast.px}px`);
        checks.ok("it starts closed", t.open === false, `open ${t.open}`);

        await page.tap(t.b.x + t.b.w / 2, t.b.y + t.b.h / 2);
        await sleep(300);
        const after = await page.eval(`
          const d = document.querySelector('[data-fov="estimates-toggle"]').closest("details");
          return { open: d.open, notes: d.querySelectorAll("li").length,
                   fare: /fare|prijs/i.test(d.textContent) };
        `);
        checks.ok("tapping it opens the notes", after.open === true, `open ${after.open}`);
        checks.atLeast("the notes are there once open", after.notes, 3, `${after.notes} notes`);
        checks.ok("the fare assumption is one of them", after.fare, "no fare note found");
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 the licence links are 44x44 targets",
    async run(ctx) {
      const { checks } = ctx;
      // These two are the app's only licence links: Open-Meteo's CC BY 4.0 and the ODbL
      // credit for OpenStreetMap. They measured 66x13 and 83x13.
      const page = await bootResults(ctx, { width: 390, height: 844 });
      try {
        const links = await page.eval(`
          const F = window.__fov;
          const note = document.querySelector('[data-fov="attribution"]');
          F.reveal(note);
          return [...note.querySelectorAll('[data-fov="credit-link"]')].map((a) => {
            const b = F.rect(a);
            return { text: a.textContent.trim(), href: a.getAttribute("href"), b,
                     contrast: F.contrast(a),
                     hit: F.hit(Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2), 'a') };
          });
        `);
        checks.equal("both credits are links", links.length, 2, links.map((l) => l.text).join(", "));
        for (const l of links) {
          checks.atLeast(`"${l.text}" is 44px tall`, l.b.h, 44, `${round(l.b.w)}x${round(l.b.h)}`);
          checks.atLeast(`"${l.text}" is 44px wide`, l.b.w, 44, `${round(l.b.w)}x${round(l.b.h)}`);
          checks.ok(`a tap on "${l.text}" reaches the link`, l.hit.inside, `hit ${l.hit.desc}`);
          checks.atLeast(`"${l.text}" clears AA`, l.contrast.ratio, AA, `${l.contrast.ratio}:1 at ${l.contrast.px}px`);
        }
        checks.ok(
          "the OpenStreetMap credit points at the copyright page, which is what signals the ODbL",
          links.some((l) => l.href === "https://www.openstreetmap.org/copyright"),
          links.map((l) => `${l.text} -> ${l.href}`).join(" | "),
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "360x800 the weather strip hides nothing and its small text clears AA",
    async run(ctx) {
      const { checks } = ctx;
      // 556px of hours in a 326px strip, inside an overflow-x-auto box with no scroll
      // affordance: four of the ten hours were unreachable for anyone who did not guess.
      const page = await bootResults(ctx, { width: 360, height: 800 });
      try {
        const s = await page.eval(`
          const F = window.__fov;
          const strip = document.querySelector('[data-fov="weather-strip"]');
          const hours = document.querySelector('[data-fov="weather-hours"]');
          const items = [...hours.querySelectorAll("li")];
          const label = items[0].querySelector("span");
          const precip = [...hours.querySelectorAll("span")].find((x) => /%$/.test(x.textContent.trim()));
          return {
            strip: { ...F.rect(strip), scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth },
            hours: { ...F.rect(hours), scrollWidth: hours.scrollWidth, clientWidth: hours.clientWidth },
            count: items.length,
            lastRight: +items[items.length - 1].getBoundingClientRect().right.toFixed(2),
            label: F.contrast(label),
            precip: precip ? F.contrast(precip) : null,
          };
        `);
        checks.atMost(
          "the strip hides nothing behind its edge",
          s.strip.scrollWidth - s.strip.clientWidth,
          0,
          `scrollWidth ${s.strip.scrollWidth} against clientWidth ${s.strip.clientWidth} ` +
            `(${s.count} hours shown; it hid 227px of 553 with ten)`,
        );
        checks.atMost(
          "the hour list hides nothing either",
          s.hours.scrollWidth - s.hours.clientWidth,
          0,
          `scrollWidth ${s.hours.scrollWidth} against clientWidth ${s.hours.clientWidth}`,
        );
        checks.atMost(
          "the last hour ends inside the strip",
          s.lastRight,
          s.strip.right,
          `last hour ends at ${round(s.lastRight)}, strip at ${round(s.strip.right)}`,
        );
        checks.atLeast("there are still hours to read", s.count, 3, `${s.count} hours`);
        checks.atLeast(
          "the hour labels clear AA",
          s.label.ratio,
          AA,
          `${s.label.ratio}:1 — ${s.label.fg} on ${s.label.bg} at ${s.label.px}px (was 2.54:1)`,
        );
        checks.ok("a rain percentage is on the strip", s.precip != null, "no percentage rendered");
        if (s.precip) {
          checks.atLeast(
            "the rain percentage clears AA",
            s.precip.ratio,
            AA,
            `${s.precip.ratio}:1 — ${s.precip.fg} on ${s.precip.bg} at ${s.precip.px}px (was 4.1:1)`,
          );
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 night the itinerary's leg chips clear AA",
    async run(ctx) {
      const { checks } = ctx;
      // White on the walking grey measured 2.56:1 and on the bike green 3.77:1. The
      // chip has to stay the leg's colour on the map, so the ink is what moves.
      const page = await bootResults(ctx, { width: 390, height: 844, theme: "dark" });
      try {
        // Measured on the screen, not in the tree: a chip inside the folded itinerary
        // still has a colour and still has a box, and scoring one would be scoring
        // something nobody is looking at.
        await openSteps(page);
        const chips = await page.eval(`
          const F = window.__fov;
          const cs = [...document.querySelectorAll('[data-fov="leg-chip"]')];
          cs.forEach((c) => F.reveal(c));
          return cs.map((c) => ({ ...F.contrast(c), h: +c.getBoundingClientRect().height.toFixed(2),
                                  painted: F.shown(c).painted }));
        `);
        checks.atLeast("the itinerary has leg chips", chips.length, 2, `${chips.length} chips`);
        for (const c of chips) {
          checks.ok(`the "${c.text}" chip is on the screen`, c.painted, `${round(c.h)}px tall`);
          checks.atLeast(
            `the "${c.text}" chip clears AA`,
            c.ratio,
            AA,
            `${c.ratio}:1 — ${c.fg} on ${c.bg} at ${c.px}px/${c.weight}`,
          );
        }
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "1280x900 the desktop results column keeps the same shape",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootResults(ctx, { width: 1280, height: 900 });
      try {
        const m = await page.eval(readRows);
        checks.equal("three options are rendered", m.rows.length, 3);
        checks.equal(
          "nothing is hidden sideways",
          m.list.scrollWidth,
          m.list.clientWidth,
          `scrollWidth ${m.list.scrollWidth} against clientWidth ${m.list.clientWidth}`,
        );
        checks.atLeast(
          "the results column is the left half of the window",
          m.column.w,
          0.4 * m.iw,
          `column ${round(m.column.w)}px of ${m.iw}px (${pct(m.column.w / m.iw)})`,
        );
        for (const [i, r] of m.rows.entries()) {
          checks.atLeast(
            `option ${i + 1} spans the column`,
            r.box.w,
            0.9 * m.list.w,
            `row ${round(r.box.w)}px of ${round(m.list.w)}px`,
          );
          const hit = await page.eval(`
            const F = window.__fov;
            const li = [...document.querySelectorAll('${OPTION}')][${i}];
            F.reveal(li);
            const b = li.querySelector('${OPTION_BUTTON}').getBoundingClientRect();
            return F.hit(Math.round(b.right - 12), Math.round(b.top + b.height / 2), '${OPTION_BUTTON}');
          `);
          checks.ok(`option ${i + 1} is tappable at its far end`, hit.inside, `hit ${hit.desc}`);
        }
        const sel = m.rows.find((r) => r.selected);
        checks.ok("the selected option still carries its itinerary", sel?.details != null, "no details panel");
        if (sel?.details) {
          checks.near(
            "the itinerary is still attached to the row",
            sel.details.top,
            sel.button.bottom,
            1.5,
            `row ends at y=${round(sel.button.bottom)}, itinerary starts at y=${round(sel.details.top)}`,
          );
        }
        // The map is still beside the results rather than under them.
        const panes = await page.eval(`
          const F = window.__fov;
          const col = document.querySelector('${COLUMN}');
          const other = [...document.querySelectorAll("main > section")].find((s) => s !== col);
          return other ? { col: F.rect(col), map: F.rect(other) } : null;
        `);
        checks.ok("the map pane is beside the results", panes != null && panes.map.x >= panes.col.right - 1,
          panes ? `results end at x=${round(panes.col.right)}, map starts at x=${round(panes.map.x)}` : "no map pane");
      } finally {
        await page.close();
      }
    },
  },
];

function round(n) {
  return Math.round(n * 100) / 100;
}
function pct(f) {
  return `${Math.round(f * 1000) / 10}%`;
}
