// The phone search path, measured.
//
// Every assertion here is a number off getBoundingClientRect, getComputedStyle or
// elementFromPoint in a real browser at real device metrics. Nothing asserts a class
// name: a class name is what the jsdom suite already checks, and what all six of the
// judge's breaking mutations kept intact while shipping an unusable screen.

import { sleep } from "../lib/chrome.mjs";
import { PROBE } from "../lib/measure.mjs";

// Eight recent trips, which is the cap the app keeps. They become sixteen endpoint
// history rows, so the suggestion list on an empty focused field is taller than the
// screen — which is what makes "does the list use the room it has" a measurable
// question rather than one that depends on how many fixtures happen to match.
const RECENTS = [
  ["Amsterdam Centraal", "Vondelpark"],
  ["De Pijp", "Rijksmuseum"],
  ["Jordaan", "Amsterdamse Poort"],
  ["Amsterdam Zuid", "NDSM"],
  ["Amsterdam Sloterdijk", "Artis"],
  ["Amstelveen", "Westerpark"],
  ["Bijlmer ArenA", "Oosterpark"],
  ["Muiderpoort", "Sarphatipark"],
].map(([from, to], i) => ({
  fromLabel: from,
  fromQuery: from,
  toLabel: to,
  toQuery: to,
  at: 1_700_000_000_000 - i * 1000,
}));

const SEED = { "fov.recentTrips.v1": RECENTS };

const SHEET = '[data-fov="search-sheet"]';
const ENTRY = '[data-fov="search-entry"]';

// Page-side helpers. Injected per call rather than kept in a bundle: each one is two
// lines and inlining them keeps every assertion's evidence next to the assertion.
const box = (sel) => `
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, right: r.right,
           bottom: r.bottom, left: r.left, iw: innerWidth, ih: innerHeight };
`;

// What a finger at (x, y) actually reaches, and whether it is inside `sel`.
const hit = (x, y, sel) => `
  const el = document.elementFromPoint(${x}, ${y});
  if (!el) return { tag: null, inside: false, desc: "nothing" };
  const inside = !!el.closest(${JSON.stringify(sel)});
  const desc = el.tagName + (el.id ? "#" + el.id : "") +
    (el.getAttribute("placeholder") ? "[placeholder=" + el.getAttribute("placeholder") + "]" : "") +
    (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "");
  return { tag: el.tagName, inside, desc };
`;

async function bootPhone(ctx, { width, height }) {
  const page = await ctx.openPhone({ width, height, seed: SEED });
  await page.goto(ctx.url);
  await page.waitFor(`document.querySelector('[data-fov="search-pill"]')`, {
    label: "the app to render its search pill",
  });
  // framer-motion settles the pill's y on the first frames; one rAF pair is enough.
  await page.eval(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
  return page;
}

async function openSheet(page) {
  const entry = await page.eval(box(ENTRY));
  await page.tap(entry.x + entry.w / 2, entry.y + entry.h / 2);
  await page.waitFor(`document.querySelector('${SHEET}')`, { label: "the search sheet to open" });
  await sleep(260); // the 180ms entry animation
  return entry;
}

// Fill one of the sheet's two fields the way a finger does: focus it, type, wait for
// the suggestions, tap one. `which` is 0 for From and 1 for To.
async function fillField(page, which, query) {
  const field = await page.eval(`
    const i = document.querySelectorAll('${SHEET} input[role="combobox"]')[${which}];
    const r = i.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `);
  await page.tap(field.x, field.y);
  await page.type(query);
  await page.waitFor(
    `[...document.querySelectorAll('${SHEET} [role="option"]')].some((o) => o.textContent.includes(${JSON.stringify(query)}))`,
    { label: `a suggestion for "${query}"` },
  );
  const row = await page.eval(`
    const o = [...document.querySelectorAll('${SHEET} [role="option"]')]
      .find((x) => x.textContent.includes(${JSON.stringify(query)}));
    const r = o.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `);
  await page.tap(row.x, row.y);
  await sleep(250);
}

async function closeSheet(page) {
  const b = await page.eval(`
    const el = document.querySelector('${SHEET} [aria-label]');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
  await page.tap(b.x, b.y);
  await page.waitFor(`!document.querySelector('${SHEET}')`, { label: "the search sheet to close" });
  await sleep(400);
}

export const scenarios = [
  {
    name: "390x844 entry button is a full-width target",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        const b = await page.eval(box(ENTRY));
        checks.ok("the phone entry button is rendered", b != null, b ? "found" : "no [data-fov=search-entry]");
        if (!b) return;
        checks.equal("viewport is the emulated phone", b.iw, 390);
        checks.atLeast(
          "entry button spans the screen",
          b.w,
          0.85 * b.iw,
          `button ${round(b.w)}px of ${b.iw}px viewport (${pct(b.w / b.iw)})`,
        );
        checks.atLeast("entry button clears a 44px finger", b.h, 44, `height ${round(b.h)}px`);
        const centre = await page.eval(hit(b.x + b.w / 2, b.y + b.h / 2, ENTRY));
        checks.ok("a tap in the middle of the entry button reaches it", centre.inside, `hit ${centre.desc}`);
        // The right-hand end is the half a chip-sized button loses first.
        const end = await page.eval(hit(b.right - 8, b.y + b.h / 2, ENTRY));
        checks.ok("a tap at the far end of the entry button reaches it", end.inside, `hit ${end.desc}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 sheet owns the whole screen",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await openSheet(page);
        const s = await page.eval(box(SHEET));
        checks.ok("the sheet is in the document", s != null, s ? "found" : "no [data-fov=search-sheet]");
        if (!s) return;
        checks.equal("sheet width equals the viewport width", round(s.w), s.iw, `sheet ${JSON.stringify(rect(s))}`);
        checks.equal("sheet starts at x=0", round(s.x), 0, `sheet ${JSON.stringify(rect(s))}`);
        checks.equal("sheet starts at y=0", round(s.y), 0, `sheet ${JSON.stringify(rect(s))}`);
        checks.equal("sheet height equals the viewport height", round(s.h), s.ih, `sheet ${JSON.stringify(rect(s))}`);

        const middle = await page.eval(hit(Math.round(s.iw / 2), Math.round(s.ih / 2), SHEET));
        checks.ok(
          "the middle of the screen belongs to the sheet",
          middle.inside,
          `elementFromPoint(${Math.round(s.iw / 2)}, ${Math.round(s.ih / 2)}) = ${middle.desc}`,
        );
        const lower = await page.eval(hit(Math.round(s.iw / 2), Math.round(s.ih * 0.85), SHEET));
        checks.ok("the bottom of the screen belongs to the sheet", lower.inside, `hit ${lower.desc}`);
        const upper = await page.eval(hit(Math.round(s.iw * 0.9), 24, SHEET));
        checks.ok("the top of the screen belongs to the sheet", upper.inside, `hit ${upper.desc}`);

        // A sheet can be the right size, in front and touchable and still be invisible.
        const painted = await page.eval(`
          const e = document.querySelector('${SHEET}');
          const cs = getComputedStyle(e);
          return { opacity: Number(cs.opacity), visibility: cs.visibility, display: cs.display,
                   overflow: cs.overflow, bg: cs.backgroundColor };
        `);
        checks.atLeast("the sheet is opaque", painted.opacity, 0.99, JSON.stringify(painted));
        checks.ok("the sheet is visible", painted.visibility === "visible" && painted.display !== "none", JSON.stringify(painted));
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 suggestion rows are full width and use the sheet's height",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await openSheet(page);
        await page.waitFor(`document.querySelectorAll('${SHEET} [role="option"]').length > 0`, {
          label: "the recents list to appear under the focused field",
        });
        const list = await page.eval(`
          const ul = document.querySelector('${SHEET} [role="listbox"]');
          const r = ul.getBoundingClientRect();
          const opts = [...ul.querySelectorAll('[role="option"]')].map((o) => {
            const b = o.getBoundingClientRect();
            return { w: b.width, h: b.height, x: b.x, text: o.textContent.trim().slice(0, 24) };
          });
          const cs = getComputedStyle(ul);
          return { list: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom },
                   maxHeight: cs.maxHeight, scrollHeight: ul.scrollHeight,
                   opts, iw: innerWidth, ih: innerHeight };
        `);
        checks.atLeast("the list has rows", list.opts.length, 1, `${list.opts.length} options`);

        const narrowest = list.opts.reduce((a, b) => (a.w <= b.w ? a : b));
        checks.atLeast(
          "every suggestion row is wider than 80% of the screen",
          narrowest.w,
          0.8 * list.iw,
          `narrowest row ${round(narrowest.w)}px of ${list.iw}px (${pct(narrowest.w / list.iw)}), row "${narrowest.text}"`,
        );
        checks.atLeast("suggestion rows clear a 44px finger", Math.min(...list.opts.map((o) => o.h)), 43);

        // Where the list is allowed to end. The desktop pill caps it at 18rem so it does
        // not swallow the page below; on the sheet there is no page below, and that cap
        // stopped the list 288px down a screen with 390px still free underneath. The
        // room, not a constant, is what it may use.
        const room = list.ih - list.list.y;
        checks.atLeast(
          "the list may run to the bottom of the sheet",
          parseFloat(list.maxHeight),
          room - 24,
          `max-height ${list.maxHeight} against ${round(room)}px of room below y=${round(list.list.y)}`,
        );
        // And the consequence: with room to spare, nothing is hidden behind an internal
        // scrollbar. Under the 18rem cap this list held 300px of rows in 288px of box.
        checks.atMost(
          "no row is hidden inside the list while the sheet has room",
          list.scrollHeight,
          list.list.h + 1,
          `${list.opts.length} rows, ${list.scrollHeight}px of content in a ${round(list.list.h)}px box ` +
            `(list ends at y=${round(list.list.bottom)} of ${list.ih}, max-height ${list.maxHeight})`,
        );
        checks.atMost("the list does not run off the bottom", list.list.bottom, list.ih + 1, `bottom ${round(list.list.bottom)}`);

        // The rows have to be reachable, not merely wide.
        const row = list.opts[0];
        const tap = await page.eval(hit(Math.round(row.x + row.w / 2), Math.round(list.list.y + row.h / 2), '[role="option"]'));
        checks.ok("a tap on the first row reaches a row", tap.inside, `hit ${tap.desc}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "360x800 a long place name is not clipped in the field",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 360, height: 800 });
      try {
        await openSheet(page);
        await page.type("Amsterdam Sloterdijk Station");
        await sleep(400);
        const f = await page.eval(`
          const input = document.querySelector('${SHEET} input[role="combobox"]');
          const r = input.getBoundingClientRect();
          const card = input.closest('form').firstElementChild.getBoundingClientRect();
          return { value: input.value, scrollWidth: input.scrollWidth, clientWidth: input.clientWidth,
                   w: r.width, x: r.x, cardW: card.width, cardX: card.x, iw: innerWidth };
        `);
        checks.ok("the field holds the whole query", f.value === "Amsterdam Sloterdijk Station", `value "${f.value}"`);
        checks.atMost(
          "the typed name fits the field without scrolling it",
          f.scrollWidth,
          f.clientWidth,
          `scrollWidth ${f.scrollWidth} against clientWidth ${f.clientWidth} ` +
            `(field ${round(f.w)}px of a ${round(f.cardW)}px card, viewport ${f.iw}px)`,
        );
        checks.atLeast(
          "the field gets nearly the whole card",
          f.w,
          0.85 * f.cardW,
          `field ${round(f.w)}px of card ${round(f.cardW)}px (${pct(f.w / f.cardW)})`,
        );
        // A control may sit over the field's padding; nothing may sit over the text.
        // The point tested is the last pixel of the input's own content box.
        const overlap = await page.eval(`
          const input = document.querySelector('${SHEET} input[role="combobox"]');
          const r = input.getBoundingClientRect();
          const pr = parseFloat(getComputedStyle(input).paddingRight);
          const el = document.elementFromPoint(r.right - pr - 4, r.y + r.height / 2);
          return { tag: el ? el.tagName : null, isInput: el === input, paddingRight: pr };
        `);
        checks.ok(
          "nothing covers the field's text",
          overlap.isInput,
          `element at the end of the text area: ${overlap.tag} (padding-right ${overlap.paddingRight}px)`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 the page behind the sheet is locked and inert",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        // From the home, where the document has a viewport of scroll left in it: this
        // is the drag the judge reproduced, which took scrollY from 0 to 485 and drove
        // the morph underneath the open sheet.
        const before = await page.eval(`return Math.round(window.scrollY);`);
        checks.equal("the test starts at the top of the document", before, 0);

        await openSheet(page);
        const opened = await page.eval(`return Math.round(window.scrollY);`);
        const locked = await page.eval(`
          const b = getComputedStyle(document.body);
          const home = document.querySelector('[data-fov="home-stage"]');
          const map = document.querySelector('[data-fov="map-stage"]');
          return { overflow: b.overflow, overflowY: b.overflowY,
                   homeInert: home ? home.hasAttribute("inert") : null,
                   mapInert: map ? map.hasAttribute("inert") : null,
                   homeHidden: home ? home.getAttribute("aria-hidden") : null,
                   mapHidden: map ? map.getAttribute("aria-hidden") : null,
                   homePE: home ? getComputedStyle(home).pointerEvents : null };
        `);
        checks.ok(
          "document.body is scroll-locked while the sheet is open",
          locked.overflow === "hidden" || locked.overflowY === "hidden",
          `body overflow "${locked.overflow}" / overflow-y "${locked.overflowY}"`,
        );
        checks.ok("the home stage is inert behind the sheet", locked.homeInert === true, `homeInert ${locked.homeInert}, homePE ${locked.homePE}`);
        checks.ok("the map stage is inert behind the sheet", locked.mapInert === true, `mapInert ${locked.mapInert}`);
        checks.ok(
          "the stages behind the sheet are hidden from assistive technology",
          locked.homeHidden === "true" && locked.mapHidden === "true",
          `home aria-hidden ${locked.homeHidden}, map aria-hidden ${locked.mapHidden}`,
        );

        // A real drag on the open sheet, upward, which is the direction that drives the
        // morph towards the map.
        await page.swipe(195, 700, 200);
        const afterSwipe = await page.eval(`return Math.round(window.scrollY);`);
        checks.equal(
          "a swipe on the open sheet does not scroll the page behind it",
          afterSwipe,
          opened,
          `scrollY ${opened} -> ${afterSwipe} across a 500px drag`,
        );

        await closeSheet(page);
        const restored = await page.eval(`
          const b = getComputedStyle(document.body);
          const home = document.querySelector('[data-fov="home-stage"]');
          return { overflow: b.overflow, overflowY: b.overflowY, scrollY: Math.round(window.scrollY),
                   homeInert: home ? home.hasAttribute("inert") : null,
                   homeHidden: home ? home.getAttribute("aria-hidden") : null };
        `);
        checks.ok(
          "the scroll lock is lifted when the sheet closes",
          restored.overflow !== "hidden" && restored.overflowY !== "hidden",
          `body overflow "${restored.overflow}" / overflow-y "${restored.overflowY}"`,
        );
        checks.ok(
          "the page behind is interactive again once the sheet closes",
          restored.homeInert === false && restored.homeHidden == null,
          `home inert ${restored.homeInert}, aria-hidden ${restored.homeHidden}`,
        );
        checks.atMost("closing the sheet leaves the scroll where it was", restored.scrollY, 2, `scrollY ${restored.scrollY}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 closing the sheet lands where it was opened",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        // Opened from the map stage. If the lock throws the document's scroll away, the
        // user closes the sheet onto a screen they did not leave.
        await page.eval(`window.scrollTo(0, window.innerHeight); return null;`);
        await sleep(800);
        const before = await page.eval(`return Math.round(window.scrollY);`);
        checks.atLeast("the test starts on the map stage", before, 100, `scrollY ${before}`);

        await openSheet(page);
        await page.swipe(195, 700, 200);
        await closeSheet(page);
        const after = await page.eval(`return Math.round(window.scrollY);`);
        checks.near(
          "the sheet returns the user to the screen they opened it from",
          after,
          before,
          2,
          `scrollY ${before} before, ${after} after`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "844x390 a phone in landscape still gets the phone layout",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 844, height: 390 });
      try {
        const entry = await page.eval(box(ENTRY));
        checks.ok(
          "landscape gets the phone search entry, not the desktop pill",
          entry != null,
          entry ? `entry ${round(entry.w)}x${round(entry.h)} at (${round(entry.x)}, ${round(entry.y)})` : "no [data-fov=search-entry]: desktop pill",
        );

        // Defect D2: on the desktop path the home scrolls under the floating pill, so a
        // popular-trip card that looks tappable is actually behind a search field.
        const card = await page.eval(`
          const c = document.querySelector('[data-fov="popular-trip"]');
          if (!c) return null;
          // Brought into view inside whatever scroller holds it, then the document's own
          // scroll is put back: moving that would drive the morph and change the screen
          // under the test.
          const y0 = window.scrollY;
          c.scrollIntoView({ block: "center" });
          window.scrollTo(0, y0);
          const r = c.getBoundingClientRect();
          const top = Math.max(r.top, 0);
          const bottom = Math.min(r.bottom, innerHeight);
          return { x: r.x, w: r.width, cy: (top + bottom) / 2, visible: bottom - top,
                   label: c.getAttribute("aria-label"), ih: innerHeight };
        `);
        checks.ok("a popular-trip card is on screen", card != null, card ? `"${card.label}"` : "none rendered");
        if (!card) return;
        checks.atLeast(
          "the card is reachable on a landscape screen",
          card.visible,
          24,
          `${round(card.visible)}px of it visible in a ${card.ih}px viewport`,
        );
        const centre = await page.eval(hit(Math.round(card.x + card.w / 2), Math.round(card.cy), '[data-fov="popular-trip"]'));
        checks.ok(
          "a touch at the centre of a popular-trip card hits the card",
          centre.inside,
          `elementFromPoint(${Math.round(card.x + card.w / 2)}, ${Math.round(card.cy)}) = ${centre.desc}`,
        );
        checks.ok("the card is not covered by a search field", centre.tag !== "INPUT", `hit ${centre.desc}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // The whole point of the sheet: a trip planned in it has to arrive somewhere.
    //
    // It did not. Typing both endpoints and touching Search ran the plan — three
    // options in the DOM within 600ms — and left the app on the home stage
    // indefinitely: scrollY 0, map still inert, seven seconds later. commitSearch
    // closed the sheet and started a *smooth* scroll to the map in the same tick, and
    // the unmounting sheet's scroll restore (an instant scrollTo(0, y) with the offset
    // it was opened at) landed second and cancelled it. Nothing in either gate
    // submitted this form, so nothing saw it.
    name: "390x844 a trip planned in the sheet lands on the map with options on screen",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await page.eval(PROBE);
        const start = await page.eval(`return Math.round(window.scrollY);`);
        checks.equal("the test starts on the home stage", start, 0);

        await openSheet(page);
        // Both endpoints, by touch: type, wait for the suggestions, tap one. The
        // destination decides the fixture, and only a "zuid" one answers with a full
        // set of options.
        await fillField(page, 0, "Amsterdam Centraal");
        await fillField(page, 1, "Amsterdam Zuid");

        const submit = await page.eval(`
          const b = document.querySelector('${SHEET} button[type="submit"]');
          const r = b.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
                   disabled: b.disabled, h: r.height };
        `);
        checks.ok("Search is enabled once both endpoints are set", !submit.disabled, `disabled ${submit.disabled}`);
        checks.atLeast("Search clears a 44px finger", submit.h, 44, `${round(submit.h)}px tall`);

        await page.tap(submit.x, submit.y);
        await page.waitFor(`!document.querySelector('${SHEET}')`, { label: "the sheet to close on submit" });
        // The morph is a smooth scroll; give it the time it takes rather than a guess,
        // and carry on measuring when it never happens.
        await page
          .waitFor(`Math.round(window.scrollY) >= innerHeight - 8`, {
            timeout: 6000,
            label: "the morph to reach the map stage",
          })
          .catch(() => {});
        await sleep(600);

        const after = await page.eval(`
          const F = window.__fov;
          const col = document.querySelector('[data-fov="results-column"]');
          const c = col ? col.getBoundingClientRect() : null;
          const rows = [...document.querySelectorAll('[data-fov="option"]')].map((li) => {
            const r = li.getBoundingClientRect();
            return { h: +r.height.toFixed(2),
                     visible: +Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)).toFixed(2),
                     shown: F.shown(li) };
          });
          const map = document.querySelector('[data-fov="map-stage"]');
          return { scrollY: Math.round(window.scrollY), ih: innerHeight,
                   mapInert: map.hasAttribute("inert"),
                   sheet: !!document.querySelector('${SHEET}'),
                   rows, colH: c ? +c.height.toFixed(2) : null };
        `);
        checks.ok("the sheet is gone", !after.sheet, "the search sheet is still mounted");
        checks.atLeast(
          "planning from the sheet lands on the map stage",
          after.scrollY,
          after.ih - 8,
          `scrollY ${after.scrollY} of a ${after.ih}px viewport (it stayed at 0 indefinitely)`,
        );
        checks.ok("the map stage is live, not inert", !after.mapInert, `inert ${after.mapInert}`);
        checks.atLeast("the plan produced options", after.rows.length, 1, `${after.rows.length} options`);
        const whole = after.rows.filter((r) => r.visible >= r.h - 0.5 && r.shown.painted);
        checks.atLeast(
          "a whole option row is on the screen when the sheet has closed",
          whole.length,
          1,
          after.rows
            .map((r, i) => `option ${i + 1}: ${round(r.visible)} of ${round(r.h)}px, painted ${r.shown.painted}`)
            .join(", ") + ` in a ${round(after.colH)}px column`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 the map stage has a visible way back",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await page.eval(`window.scrollTo(0, window.innerHeight); return null;`);
        await sleep(800);
        const back = await page.eval(`
          const b = document.querySelector('[data-fov="map-back"]');
          if (!b) return null;
          const r = b.getBoundingClientRect();
          const cs = getComputedStyle(b);
          return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top,
                   label: b.getAttribute("aria-label"), opacity: Number(getComputedStyle(b.closest("header") ?? b).opacity),
                   pe: cs.pointerEvents, iw: innerWidth };
        `);
        checks.ok("the map stage has a back control", back != null, back ? `"${back.label}"` : "no [data-fov=map-back]");
        if (!back) return;
        checks.atLeast("the back control is a 44px target", Math.min(back.w, back.h), 44, `${round(back.w)}x${round(back.h)}`);
        checks.atMost("the back control is in the top bar", back.top, 96, `top ${round(back.top)}`);
        checks.atMost("the back control is at the leading edge", back.x, 0.25 * back.iw, `x ${round(back.x)}`);
        checks.atLeast("the back control is visible on the map stage", back.opacity, 0.9, `header opacity ${back.opacity}`);

        const centre = await page.eval(hit(Math.round(back.x + back.w / 2), Math.round(back.y + back.h / 2), '[data-fov="map-back"]'));
        checks.ok("a tap on the back control reaches it", centre.inside, `hit ${centre.desc}`);

        await page.tap(back.x + back.w / 2, back.y + back.h / 2);
        await sleep(900);
        const y = await page.eval(`return Math.round(window.scrollY);`);
        checks.atMost("tapping back returns to the home stage", y, 8, `scrollY ${y} after the tap`);
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
function rect(b) {
  return { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
}
