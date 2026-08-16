// The map stage's chrome, measured.
//
// The strip of controls over and around the map once a trip is planned: the filter bar,
// the header menu, the safe-area insets under them, what they leave for the content on a
// phone turned sideways, and the aurora's hand-off during the morph. Every assertion is
// a number off getBoundingClientRect, getComputedStyle, elementFromPoint or the CSSOM.
// None of them names a class or counts a node — that is what the jsdom suite already
// does, and the filter bar's two unreachable controls answered every one of those tests
// for as long as they existed.
//
// The numbers that started this file, at 390x844 on a planned trip:
//   filter bar     scrollWidth 545, clientWidth 358. 187px off screen (198 in Dutch,
//                  228 at 360 wide), no fade, no scrollbar, and elementFromPoint at the
//                  centre of "Radar" and "Hide map" returning nothing.
//   header menu    423px of panel (453 in Dutch) hanging out of a 390px landscape
//                  screen with overflow: visible, and Tab leaving the open menu for the
//                  search pill behind it.
//   landscape      170px of chrome before the content on a 390px-tall screen (43.6%),
//                  leaving the map and the advice 220px between them.
//   aurora         a 10.5px band of bare page at the foot of the screen mid-morph.

import { sleep } from "../lib/chrome.mjs";
import { PROBE, TRIP_SEED } from "../lib/measure.mjs";

const BAR = '[data-fov="filter-bar"]';
const SCROLLER = '[data-fov="filter-scroller"]';
const MORE = '[data-fov="filter-more"]';
const PANEL = '[data-fov="filter-panel"]';
const CUE_RIGHT = '[data-fov="filter-cue-right"]';
const PILL = '[data-fov="search-pill"]';
const STAGE = '[data-fov="map-stage"]';
const HOME = '[data-fov="home-stage"]';
const COLUMN = '[data-fov="results-column"]';

// 320 is the narrowest screen still sold (an SE in portrait / a phone at the largest
// text size); 360 and 390 are the two the rest of this suite stands on.
const PHONES = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
];
const LANGS = ["en", "nl"];
const THEMES = ["light", "dark"];

function round(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : n;
}
function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

async function bootMap(ctx, { width, height, theme = "light", lang = "en" }) {
  const page = await ctx.openPhone({ width, height, theme, lang, seed: TRIP_SEED });
  await page.goto(ctx.url);
  await page.waitFor(`document.querySelector('${PILL}')`, { label: "the app to render its search pill" });
  await page.eval(PROBE);
  const row = await page.eval(`
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Zuidplein"));
    if (!b) return null;
    window.__fov.reveal(b);
    return window.__fov.rect(b);
  `);
  if (!row) throw new Error("the seeded recent trip is not on the home screen");
  await page.tap(row.x + row.w / 2, row.y + row.h / 2);
  await page.waitFor(`document.querySelectorAll('[data-fov="option"]').length >= 3`, { label: "three travel options" });
  await sleep(900); // the morph, and the map chunk settling under it
  await page.eval(PROBE);
  return page;
}

// Every control the filter bar shows, with whether it is PAINTED, how much of it a
// finger can actually land on, and how much of the row is past the clip.
//
// This used to roll its own getBoundingClientRect + elementFromPoint pair, and that is
// the reason two mutations of this bar went red only by accident. `opacity: 0` on
// [data-fov="filter-bar"] leaves a blank 68px band where three filters and the map-tools
// control should be, and every read here answered as if nothing had happened: the rects
// are still 44px and the centre hit still lands on the chip, because an element with
// zero opacity is still the hit-test target. `window.__fov.shown()` — in this repo since
// the results spec needed it, and documented there as the answer to "three separate
// things can be true of a node nobody can see" — asks `checkVisibility` as well, with
// `opacityProperty` and `visibilityProperty` on.
//
// `visibleH` is the other half. A rect is not clipped by an ancestor's `overflow:
// hidden`, so `max-h-0` on the bar — which leaves the 24px of padding and cuts the rest
// — still reports 44px-tall chips whose centres fall inside the surviving band: a 24px
// finger target answering a 44px question. So the height is asked of the intersection
// with every ancestor that clips (the scroller and the bar are both one) and with the
// viewport, not of the box the chip claims.
const READ_BAR = `
  const F = window.__fov;
  const bar = document.querySelector('${BAR}');
  const scroller = document.querySelector('${SCROLLER}');
  const cue = document.querySelector('${CUE_RIGHT}');
  const visibleHeight = (el) => {
    const r = el.getBoundingClientRect();
    let top = r.top, bottom = r.bottom;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const b = n.getBoundingClientRect();
      top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom);
    }
    return +Math.max(0, Math.min(bottom, innerHeight) - Math.max(top, 0)).toFixed(2);
  };
  const controls = [...bar.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    return {
      ...F.shown(b),
      text: (b.textContent || "").trim() || b.getAttribute("aria-label"),
      left: +r.left.toFixed(2), right: +r.right.toFixed(2),
      visibleH: visibleHeight(b),
    };
  });
  return {
    bar: F.rect(bar),
    scroller: scroller
      ? { ...F.rect(scroller), scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
          hidden: scroller.scrollWidth - scroller.clientWidth }
      : null,
    cueOpacity: cue ? Number(getComputedStyle(cue).opacity) : null,
    controls, iw: innerWidth, ih: innerHeight,
  };
`;

export const scenarios = [
  {
    // The whole defect in one question: is every control on the bar reachable by a
    // finger, and is anything the bar is holding off screen without saying so?
    //
    // Before: no. "Radar" sat at x 383..445 and "Hide map" at 456..560 inside a 358px
    // clip, elementFromPoint at both centres returned nothing, and the row's own right
    // edge showed no fade and no cut chip — the "End" chip happened to finish 3px
    // before the clip, so the bar looked complete and was not.
    name: "phones every filter-bar control is reachable and nothing is hidden without a cue",
    async run(ctx) {
      const { checks } = ctx;
      for (const { width, height } of PHONES) {
        for (const lang of LANGS) {
          const at = `${width}x${height} ${lang}`;
          const page = await bootMap(ctx, { width, height, lang });
          try {
            const m = await page.eval(READ_BAR);
            checks.ok(`${at}: the bar renders controls`, m.controls.length > 0, `${m.controls.length} buttons`);
            for (const c of m.controls) {
              // Painted, not present: a computed display, a box with size, on screen,
              // opacity and visibility that Chrome agrees render, and a touch at the
              // centre of what is on screen landing on the control itself. The first
              // four of those are what an invisible bar used to pass.
              checks.ok(
                `${at}: "${c.text}" is painted, not just in the bar`,
                c.painted,
                `display ${c.display}, opacity ${c.opacity}, visibility ${c.visibility}, ` +
                  `rendered ${c.rendered}, ${round(c.w)}x${round(c.h)}, ` +
                  `elementFromPoint(${c.x}, ${c.y}) = ${c.hit}; ` +
                  `box ${round(c.left)}..${round(c.right)} in a ${m.iw}px screen`,
              );
              checks.atLeast(`${at}: "${c.text}" is 44px tall`, c.h, 44, `${round(c.h)}px`);
              checks.atLeast(`${at}: "${c.text}" is 44px wide`, c.w, 44, `${round(c.w)}px`);
              // And 44px of it survives whatever clips it. The box being 44px tall is
              // not the same question: a bar clamped to a 24px band leaves the box at
              // 44 and the finger with 24.
              checks.atLeast(
                `${at}: 44px of "${c.text}" survives the clip`,
                c.visibleH,
                44,
                `${round(c.visibleH)}px of a ${round(c.h)}px control is inside every ancestor that clips it`,
              );
            }
            checks.ok(`${at}: the chips sit in a scroller`, m.scroller != null, m.scroller ? "found" : `no ${SCROLLER}`);
            if (!m.scroller) continue;
            // The contract, stated as the two cases it has:
            //
            // Nothing past the clip, and then the cue that would say so is off — a cue
            // that is always on is a cue nobody reads. This is what 360 and 390 give in
            // both languages, because the bar now holds only the three mode chips.
            //
            // Or something past it, and then BOTH affordances Google Maps uses: a chip
            // visibly cut at the edge, and a fade over it. 320 in English is that case —
            // the three chips measure 232px against 205px of room — and it is the case
            // the old bar failed at every width, with 187px hidden behind a clean edge.
            if (m.scroller.hidden <= 1) {
              checks.equal(
                `${at}: nothing is past the clip, so the scroll cue is off`,
                m.cueOpacity,
                0,
                `scrollWidth ${m.scroller.scrollWidth} vs clientWidth ${m.scroller.clientWidth}`,
              );
            } else {
              checks.equal(
                `${at}: ${m.scroller.hidden}px is past the clip, so the scroll cue is painted`,
                m.cueOpacity,
                1,
                `scrollWidth ${m.scroller.scrollWidth} vs clientWidth ${m.scroller.clientWidth}`,
              );
              const edge = m.scroller.right;
              const cut = m.controls.find((c) => c.left < edge - 4 && c.right > edge + 4);
              checks.ok(
                `${at}: and a chip is visibly cut at that edge`,
                cut != null,
                cut
                  ? `"${cut.text}" spans ${round(cut.left)}..${round(cut.right)} across the clip at ${round(edge)}`
                  : `no chip straddles x=${round(edge)}: ${m.controls.map((c) => `${c.text} ${round(c.left)}..${round(c.right)}`).join(", ")}`,
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
    // The other half of "hidden or hinted": when the row really does run out of room —
    // a narrower screen, a longer language — the cue has to appear. This drives the
    // viewport down until it does, so the assertion is about the mechanism rather than
    // about one lucky width.
    name: "a filter row too long for the screen paints its scroll cue",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 390, height: 844, lang: "nl" });
      try {
        const wide = await page.eval(READ_BAR);
        checks.equal("at 390 nothing is hidden, and the cue is off", wide.cueOpacity, 0, `${wide.scroller.hidden}px hidden`);
        // 260px: narrower than any phone sold, which is the point — it is the case the
        // measurements above do not cover.
        await page.setViewport({ width: 260, height: 800 });
        await sleep(400);
        const narrow = await page.eval(READ_BAR);
        checks.atLeast(
          "at 260 the Dutch chips really do overflow",
          narrow.scroller.hidden,
          1,
          `scrollWidth ${narrow.scroller.scrollWidth} vs clientWidth ${narrow.scroller.clientWidth}`,
        );
        checks.equal(
          "and the cue is painted at the edge that has more behind it",
          narrow.cueOpacity,
          1,
          `${narrow.scroller.hidden}px hidden`,
        );
        // The cue must not be a mask over the chips: it is a gradient off the stage's
        // own background, and a finger through it still reaches the chip underneath.
        const through = await page.eval(`
          const F = window.__fov;
          const cue = document.querySelector('${CUE_RIGHT}');
          const r = cue.getBoundingClientRect();
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
          const at = document.elementFromPoint(x, y);
          return { x, y, tag: at ? at.tagName : "nothing", isCue: at === cue,
                   pointerEvents: getComputedStyle(cue).pointerEvents };
        `);
        checks.equal("the cue does not take the touch", through.pointerEvents, "none", `hit ${through.tag}`);
        checks.ok("a touch through the cue reaches what is under it", !through.isCue, `hit ${through.tag}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // What folded behind the trailing control has to come back with one tap, be as
    // touchable as it was on the bar, and leave the map on screen while it is open.
    //
    // At every phone width, not just the roomiest one. This ran at 390x844 alone, and
    // the <=50% map-coverage standard it states below was over by three points at 320 —
    // a 240px panel on a 288px map pane — with nothing to say so, because 320 is the one
    // width the scenario did not visit while the filter-bar scenario in this same file
    // did. The width that used to fail is now the width that is tested.
    name: "phones the map tools are one tap from the bar and the map stays visible",
    async run(ctx) {
      const { checks } = ctx;
      for (const { width, height } of PHONES) {
        for (const theme of THEMES) {
          for (const lang of LANGS) {
            const at = `${width}x${height} ${lang} ${theme}`;
            const page = await bootMap(ctx, { width, height, theme, lang });
            try {
              const more = await page.eval(`
                const F = window.__fov;
                const b = document.querySelector('${MORE}');
                return b ? { ...F.rect(b), expanded: b.getAttribute("aria-expanded") } : null;
              `);
              checks.ok(`${at}: the bar has a control for the map tools`, more != null, more ? "found" : `no ${MORE}`);
              if (!more) continue;
              checks.equal(`${at}: it starts closed`, more.expanded, "false");
              await page.tap(more.x + more.w / 2, more.y + more.h / 2);
              await sleep(260);
              const open = await page.eval(`
                const F = window.__fov;
                const panel = document.querySelector('${PANEL}');
                if (!panel) return { open: false };
                const rows = [...panel.querySelectorAll('button')].map((b) => {
                  const r = b.getBoundingClientRect();
                  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
                  const el = document.elementFromPoint(x, y);
                  return { text: (b.textContent || "").trim(), w: +r.width.toFixed(2), h: +r.height.toFixed(2), x, y,
                           reaches: !!el && (el === b || b.contains(el)),
                           hit: el ? el.tagName : "nothing" };
                });
                // How much of the map pane is still on screen and not behind the panel.
                const map = document.querySelector('.leaflet-container') ||
                            document.querySelector('${COLUMN}').parentElement.querySelector('section:nth-of-type(2)');
                const mr = map.getBoundingClientRect(), pr = panel.getBoundingClientRect();
                const overlapH = Math.max(0, Math.min(mr.bottom, pr.bottom) - Math.max(mr.top, pr.top));
                const overlapW = Math.max(0, Math.min(mr.right, pr.right) - Math.max(mr.left, pr.left));
                return {
                  open: true, panel: F.rect(panel), rows,
                  map: F.rect(map),
                  covered: overlapH * overlapW, mapArea: mr.width * mr.height,
                  iw: innerWidth, ih: innerHeight,
                };
              `);
              checks.ok(`${at}: one tap opens the map tools`, open.open, open.open ? "panel present" : "no panel");
              if (!open.open) continue;
              for (const r of open.rows) {
                checks.atLeast(`${at}: the "${r.text}" tool is 44px tall`, r.h, 44, `${round(r.h)}px`);
                checks.atLeast(`${at}: the "${r.text}" tool is 44px wide`, r.w, 44, `${round(r.w)}px`);
                checks.ok(
                  `${at}: a touch at the centre of "${r.text}" reaches it`,
                  r.reaches,
                  `elementFromPoint(${r.x}, ${r.y}) = ${r.hit}`,
                );
              }
              // Every control that used to be on the bar is in here.
              const names = open.rows.map((r) => r.text.toLowerCase()).join("|");
              for (const [what, re] of [
                ["the start picker", /(^|\|)start/],
                ["the end picker", /end|einde/],
                ["the radar", /radar/],
                ["hide map", /hide map|verberg kaart/],
              ]) {
                checks.ok(`${at}: the panel still offers ${what}`, re.test(names), `rows: ${names}`);
              }
              // Google Maps never hides the map behind its own filters.
              checks.atMost(
                `${at}: the panel leaves most of the map showing`,
                open.covered / open.mapArea,
                0.5,
                `${pct(open.covered / open.mapArea)} of the map pane is behind the panel — ` +
                  `panel ${round(open.panel.w)}x${round(open.panel.h)} on a ` +
                  `${round(open.map.w)}x${round(open.map.h)} pane; a fixed 240px panel was 53.1% here at 320`,
              );
              checks.atMost(`${at}: the panel stays on screen`, open.panel.right, open.iw, `right edge ${round(open.panel.right)} of ${open.iw}`);
              checks.atLeast(`${at}: the panel stays on screen`, open.panel.left, 0, `left edge ${round(open.panel.left)}`);
              // A tap anywhere else closes it rather than landing on the map.
              await page.tap(20, open.ih - 40);
              await sleep(240);
              const closed = await page.eval(`return !document.querySelector('${PANEL}');`);
              checks.ok(`${at}: a tap outside closes the panel`, closed, closed ? "closed" : "still open");
            } finally {
              await page.close();
            }
          }
        }
      }
    },
  },

  {
    // The header menu on a phone turned sideways. It was 423px of panel (453 in Dutch)
    // anchored under a 48px header on a 390px screen, with overflow: visible inside a
    // sticky box that clips at the viewport — 82 to 113px of it, including the whole
    // about block, simply gone.
    name: "the header menu fits the screen it is opened on, portrait and landscape",
    async run(ctx) {
      const { checks } = ctx;
      for (const [width, height] of [[390, 844], [844, 390]]) {
        for (const lang of LANGS) {
          for (const theme of THEMES) {
            const at = `${width}x${height} ${lang} ${theme}`;
            const page = await bootMap(ctx, { width, height, lang, theme });
            try {
              const trig = await page.eval(`const F = window.__fov; return F.rect(document.querySelector('nav button'));`);
              await page.tap(trig.x + trig.w / 2, trig.y + trig.h / 2);
              await sleep(260);
              const m = await page.eval(`
                const F = window.__fov;
                const panel = document.querySelector('nav > div');
                if (!panel) return { open: false };
                const cs = getComputedStyle(panel);
                const rows = [...panel.querySelectorAll('button')].map((b) => {
                  const r = b.getBoundingClientRect();
                  return { text: (b.textContent || "").trim().slice(0, 22), h: +r.height.toFixed(2) };
                });
                return {
                  open: true, panel: { ...F.rect(panel), scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
                                       overflowY: cs.overflowY },
                  rows, ih: innerHeight,
                };
              `);
              checks.ok(`${at}: the menu opens`, m.open, m.open ? "open" : "no panel");
              if (!m.open) continue;
              checks.atMost(
                `${at}: the panel's bottom is on screen`,
                m.panel.bottom,
                m.ih,
                `panel ${round(m.panel.top)}..${round(m.panel.bottom)} in a ${m.ih}px screen; it was 502.75 at 844x390 nl`,
              );
              for (const r of m.rows) {
                checks.atLeast(`${at}: the "${r.text}" row is 44px tall`, r.h, 44, `${round(r.h)}px`);
              }
              // Anything the clamp cut off has to be scrollable back, and the last thing
              // in the panel is the about block — the only place the map's sources are
              // named. Scroll the panel to its end and read where that block lands.
              const tail = await page.eval(`
                const F = window.__fov;
                const panel = document.querySelector('nav > div');
                panel.scrollTop = panel.scrollHeight;
                const about = panel.lastElementChild;
                const pr = panel.getBoundingClientRect(), ar = about.getBoundingClientRect();
                return {
                  scrolled: panel.scrollTop,
                  aboutBottom: +ar.bottom.toFixed(2), panelBottom: +pr.bottom.toFixed(2),
                  text: (about.textContent || "").trim().slice(0, 30),
                  visible: +(Math.min(ar.bottom, pr.bottom, innerHeight) - Math.max(ar.top, pr.top, 0)).toFixed(2),
                  height: +ar.height.toFixed(2),
                };
              `);
              checks.near(
                `${at}: scrolled to the end, the about block is fully on screen`,
                tail.visible,
                tail.height,
                1.5,
                `${round(tail.visible)}px of a ${round(tail.height)}px block ("${tail.text}…"), panel scrolled ${round(tail.scrolled)}px`,
              );
            } finally {
              await page.close();
            }
          }
        }
      }
    },
  },

  {
    // An open menu is the only thing on the screen. Before the trap, the seventh Tab
    // out of an open menu at 390x844 landed on the search pill's entry button behind
    // the panel — focus on a control the user could not see, under one they could.
    name: "390x844 Tab stays inside the open header menu, and closing it gives focus back",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 390, height: 844, lang: "nl" });
      try {
        const trig = await page.eval(`const F = window.__fov; return F.rect(document.querySelector('nav button'));`);
        await page.tap(trig.x + trig.w / 2, trig.y + trig.h / 2);
        await sleep(260);
        const stops = [];
        for (let i = 0; i < 12; i++) {
          await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
          await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
          await sleep(45);
          stops.push(await page.eval(`
            const a = document.activeElement;
            if (!a) return { where: "nothing", inMenu: false };
            const r = a.getBoundingClientRect();
            return {
              where: a.tagName + " \\"" + ((a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 22)) + "\\"",
              inMenu: !!a.closest('nav'),
              onScreen: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
            };
          `));
        }
        const escaped = stops.filter((s) => !s.inMenu);
        checks.equal(
          "twelve Tabs never leave the open menu",
          escaped.length,
          0,
          escaped.length ? `left for ${escaped.map((s) => s.where).join(", ")}` : stops.map((s) => s.where).join(" -> "),
        );
        checks.ok(
          "every stop inside it is on screen",
          stops.every((s) => s.onScreen),
          stops.filter((s) => !s.onScreen).map((s) => s.where).join(", ") || "all on screen",
        );
        // And the scrim that closes it hands focus back, not just Escape.
        await page.tap(20, 700);
        await sleep(240);
        const after = await page.eval(`
          const a = document.activeElement;
          const trigger = document.querySelector('nav button');
          return { closed: !document.querySelector('nav > div'), onTrigger: a === trigger,
                   where: a ? a.tagName + " \\"" + (a.textContent || "").trim().slice(0, 22) + "\\"" : "none" };
        `);
        checks.ok("a tap outside closes the menu", after.closed, after.closed ? "closed" : "still open");
        checks.ok("and focus goes back to the control that opened it", after.onTrigger, `focus on ${after.where}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // Safe areas, as far as emulation can go.
    //
    // Chrome's device metrics report env(safe-area-inset-*) as 0 whatever is emulated,
    // so a notch cannot be measured here and this test does not pretend to: it reads the
    // *specified* value out of the CSSOM, where the env() term survives, and the
    // *computed* value off the element, where it has already resolved to the 0-inset
    // number. So each box has to both ask for the inset and lay out exactly as it did
    // before on a phone that has none. A real notched device is still unverified.
    name: "the fixed chrome asks for the device's safe-area insets and is unchanged at inset 0",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 390, height: 844 });
      try {
        // Everything a rule sets on an element, straight from the stylesheets: computed
        // style has already resolved env() to 0px, which is exactly the term we need.
        const specified = `
          window.__spec = (el, prop) => {
            let out = "";
            for (const sheet of document.styleSheets) {
              let rules;
              try { rules = sheet.cssRules; } catch { continue; }
              for (const rule of rules) {
                if (!rule.selectorText) continue;
                let matches = false;
                try { matches = el.matches(rule.selectorText); } catch { continue; }
                if (!matches) continue;
                const v = rule.style.getPropertyValue(prop);
                if (v) out = v;
              }
            }
            return out || el.style.getPropertyValue(prop);
          };
          return true;
        `;
        await page.eval(specified);
        const boxes = [
          ["the map stage's headroom", STAGE, "padding-top", "safe-area-inset-top", "132px"],
          ["the map stage's left edge", STAGE, "padding-left", "safe-area-inset-left", "0px"],
          ["the map stage's right edge", STAGE, "padding-right", "safe-area-inset-right", "0px"],
          ["the header's height", "header", "height", "safe-area-inset-top", "56px"],
          ["the header's left edge", "header", "padding-left", "safe-area-inset-left", "16px"],
          ["the header's right edge", "header", "padding-right", "safe-area-inset-right", "16px"],
          ["the search pill's resting top", PILL, "top", "safe-area-inset-top", "0px"],
          ["the search pill's left edge", PILL, "left", "safe-area-inset-left", "12px"],
          ["the search pill's right edge", PILL, "right", "safe-area-inset-right", "12px"],
          ["the content's bottom", "#fov-map-main", "padding-bottom", "safe-area-inset-bottom", "16px"],
          ["the home stage's top", HOME, "padding-top", "safe-area-inset-top", "0px"],
          ["the home stage's bottom", HOME, "padding-bottom", "safe-area-inset-bottom", "0px"],
        ];
        for (const [what, sel, prop, inset, expected] of boxes) {
          const m = await page.eval(`
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return null;
            return { spec: window.__spec(el, ${JSON.stringify(prop)}),
                     computed: getComputedStyle(el).getPropertyValue(${JSON.stringify(prop)}) };
          `);
          checks.ok(`${what}: the element is there`, m != null, m ? "found" : `no ${sel}`);
          if (!m) continue;
          checks.ok(
            `${what} asks for env(${inset})`,
            m.spec.includes(`env(${inset})`),
            `specified ${JSON.stringify(m.spec)}`,
          );
          checks.equal(
            `${what} is unchanged where the inset is 0`,
            m.computed,
            expected,
            `specified ${JSON.stringify(m.spec)}`,
          );
        }
        // And the inset-0 layout is the one the rest of this suite measures: the pill
        // still rests clear of the header, and the bar still starts clear of the pill.
        const stack = await page.eval(`
          const F = window.__fov;
          return { header: F.rect(document.querySelector('header')), pill: F.rect(document.querySelector('${PILL}')),
                   chip: F.rect(document.querySelector('${SCROLLER} button')) };
        `);
        checks.atLeast(
          "the pill rests below the header",
          stack.pill.top,
          stack.header.bottom,
          `pill top ${round(stack.pill.top)}, header bottom ${round(stack.header.bottom)}`,
        );
        checks.atLeast(
          "the filter bar's first chip starts below the pill",
          stack.chip.top,
          stack.pill.bottom,
          `chip top ${round(stack.chip.top)}, pill bottom ${round(stack.pill.bottom)}`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    // A phone on its side. The chrome above the content was 52.8% of the screen at
    // recon, 49.7% after the results pass, 43.6% after this one started — the map and
    // the advice never had two thirds of a 390px screen between them.
    name: "844x390 the map and the advice get two thirds of a landscape screen",
    async run(ctx) {
      const { checks } = ctx;
      for (const lang of LANGS) {
        const page = await bootMap(ctx, { width: 844, height: 390, lang });
        try {
          const m = await page.eval(`
            const F = window.__fov;
            const main = document.querySelector('#fov-map-main');
            const col = document.querySelector('${COLUMN}');
            const mapPane = main.querySelector('section:nth-of-type(2)');
            const header = document.querySelector('header');
            const pill = document.querySelector('${PILL}');
            const bar = document.querySelector('${BAR}');
            return {
              ih: innerHeight, iw: innerWidth,
              header: F.rect(header), pill: F.rect(pill), bar: F.rect(bar),
              main: F.rect(main), col: F.rect(col), mapPane: mapPane ? F.rect(mapPane) : null,
            };
          `);
          const content = Math.max(m.col.h, m.mapPane ? m.mapPane.h : 0);
          checks.atLeast(
            `${lang}: the results column and the map each get two thirds of the screen`,
            content / m.ih,
            2 / 3,
            `column ${round(m.col.h)}px, map ${round(m.mapPane ? m.mapPane.h : 0)}px of ${m.ih} (${pct(content / m.ih)}); ` +
              `the chrome above them was 170px (43.6%), now ${round(m.main.top)}px (${pct(m.main.top / m.ih)})`,
          );
          checks.atMost(
            `${lang}: the chrome above the content is under a third of the screen`,
            m.main.top / m.ih,
            1 / 3,
            `${round(m.main.top)}px of ${m.ih}`,
          );
          // The filters are not gone, they are one tap away — and still on the bar.
          const more = await page.eval(`
            const F = window.__fov;
            const b = document.querySelector('${MORE}');
            const chips = [...document.querySelectorAll('${SCROLLER} button')].map((x) => ({ ...F.rect(x), text: x.textContent.trim() }));
            return { more: b ? F.rect(b) : null, chips };
          `);
          checks.atLeast(`${lang}: the mode filters are still on the bar`, more.chips.length, 3, more.chips.map((c) => c.text).join(", "));
          checks.ok(`${lang}: the map's tools are one tap away`, more.more != null, more.more ? "trailing control present" : `no ${MORE}`);
          // The pill shares the header bar here, so it must not run into either of the
          // header's own controls.
          const clear = await page.eval(`
            const F = window.__fov;
            const wordmark = [...document.querySelectorAll('header button')].find((b) => b.textContent.includes("Fiets of OV"));
            const menu = document.querySelector('header nav button');
            return { wordmark: F.rect(wordmark), menu: F.rect(menu), pill: F.rect(document.querySelector('${PILL}')) };
          `);
          checks.atLeast(
            `${lang}: the pill clears the wordmark`,
            clear.pill.left - clear.wordmark.right,
            4,
            `wordmark ends ${round(clear.wordmark.right)}, pill starts ${round(clear.pill.left)}`,
          );
          checks.atLeast(
            `${lang}: the pill clears the menu button`,
            clear.menu.left - clear.pill.right,
            4,
            `pill ends ${round(clear.pill.right)}, menu starts ${round(clear.menu.left)}`,
          );
          checks.atMost(
            `${lang}: and it stays inside the header bar`,
            clear.pill.bottom,
            m.header.bottom,
            `pill ${round(clear.pill.top)}..${round(clear.pill.bottom)}, header ends ${round(m.header.bottom)}`,
          );
        } finally {
          await page.close();
        }
      }
    },
  },

  {
    // The other side of every change above: none of it may reach the desktop. The bar
    // there still carries all seven controls in one row, and the pill is still the
    // centred max-w-2xl box it has always been — the left/right pair that replaced its
    // width has to compute to the same geometry wherever the insets are 0, which is
    // everywhere but a notched phone.
    name: "1280x900 the desktop filter bar and search pill are unchanged",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootMap(ctx, { width: 1280, height: 900, lang: "nl" });
      try {
        const m = await page.eval(READ_BAR);
        checks.equal("the desktop bar keeps every control on one row", m.controls.length, 7,
          m.controls.map((c) => c.text).join(", "));
        checks.ok("and folds nothing behind a disclosure", m.scroller == null, m.scroller ? "phone scroller present" : "no phone scroller");
        for (const c of m.controls) {
          checks.ok(
            `"${c.text}" is painted and a click at its centre reaches it`,
            c.painted,
            `display ${c.display}, opacity ${c.opacity}, ${round(c.w)}x${round(c.h)}, ` +
              `elementFromPoint(${c.x}, ${c.y}) = ${c.hit}`,
          );
        }
        checks.atMost(
          "nothing on the bar is past its clip",
          m.bar.right - m.controls[m.controls.length - 1].right,
          m.bar.w,
          `bar ends at ${round(m.bar.right)}, last control at ${round(m.controls[m.controls.length - 1].right)}`,
        );
        const pill = await page.eval(`
          const F = window.__fov;
          const p = document.querySelector('${PILL}');
          const cs = getComputedStyle(p);
          return { ...F.rect(p), maxWidth: cs.maxWidth, iw: innerWidth };
        `);
        // 1280 is the `xl` tier, where the cap is max-w-3xl (768px), centred: 256
        // either side. Below it the cap is max-w-2xl. Both come from the class the pill
        // has always carried, and the left/right pair that replaced its width does not
        // touch either.
        checks.equal("the pill is capped at max-w-3xl on the xl tier", pill.maxWidth, "768px");
        checks.near("and centred in the window", pill.left + pill.w / 2, pill.iw / 2, 1,
          `pill ${round(pill.left)}..${round(pill.right)} in ${pill.iw}px`);
        checks.equal("at its resting width", round(pill.w), 768, `${round(pill.w)}px`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // The aurora is the home's background, and the home rises 30px as it fades. It rose
    // with it: at progress 0.35 its bottom edge was at y=833.5 on an 844px screen and
    // the 10.5px strip below it was the bare page — a hard step from rgb(249,250,253) to
    // rgb(255,255,255) in light, and rgb(34,44,47) to rgb(32,40,46) at night.
    name: "390x844 the aurora covers the screen for the whole morph, both themes",
    async run(ctx) {
      const { checks } = ctx;
      for (const theme of THEMES) {
        const page = await ctx.openPhone({ width: 390, height: 844, theme, lang: "en" });
        try {
          await page.goto(ctx.url);
          await page.waitFor(`document.querySelector('${PILL}')`, { label: "the app to render its search pill" });
          await page.eval(PROBE);
          let sawMidMorph = 0;
          for (const frac of [0.3, 0.35, 0.4, 0.45]) {
            await page.eval(`window.scrollTo(0, Math.round(innerHeight * ${frac})); return true;`);
            await sleep(320);
            const m = await page.eval(`
              const F = window.__fov;
              const home = document.querySelector('${HOME}');
              const aurora = document.querySelector('[data-fov="home-aurora"]');
              const hs = getComputedStyle(home);
              // Where the aurora is actually PAINTED, not where its box says it is.
              // Its own rect is not the answer: an ancestor that clips (and the home
              // stage does — overflow-x: hidden with a visible y computes to auto on
              // both axes) cuts it wherever that ancestor's box ends, and the ancestor
              // is the thing that moves. Counter-translating the aurora put its rect
              // back on the screen and left exactly the same band on the glass.
              const clip = (el) => {
                let r = el.getBoundingClientRect();
                let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
                for (let n = el.parentElement; n; n = n.parentElement) {
                  const cs = getComputedStyle(n);
                  if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
                  const b = n.getBoundingClientRect();
                  top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom);
                  left = Math.max(left, b.left); right = Math.min(right, b.right);
                }
                return { top: +top.toFixed(2), bottom: +bottom.toFixed(2),
                         left: +left.toFixed(2), right: +right.toFixed(2) };
              };
              return {
                scrollY: Math.round(scrollY), ih: innerHeight,
                homeOpacity: Number(hs.opacity), homeTop: +home.getBoundingClientRect().top.toFixed(2),
                aurora: F.rect(aurora), painted: clip(aurora),
                blobs: aurora.childElementCount,
              };
            `);
            // Only frames where the home is still painting are frames with a seam to
            // find: past the fade there is nothing of the home left to leave a band.
            if (m.homeOpacity <= 0.02) continue;
            sawMidMorph++;
            const at = `${theme} scrollY ${m.scrollY} (home at ${m.homeOpacity.toFixed(2)})`;
            checks.ok(`${at}: the aurora is the home's background`, m.blobs > 0, `${m.blobs} blobs`);
            checks.atLeast(
              `${at}: the aurora is painted all the way to the foot of the screen`,
              m.painted.bottom,
              m.ih,
              `painted down to y=${round(m.painted.bottom)} on a ${m.ih}px screen (its own box ends at ` +
                `${round(m.aurora.bottom)}), home lifted to ${round(m.homeTop)}; ` +
                `it left a ${round(m.ih - m.painted.bottom)}px band, and it was 10.49px here`,
            );
            checks.atMost(
              `${at}: and up to the top of it`,
              m.painted.top,
              0,
              `painted from y=${round(m.painted.top)}`,
            );
          }
          checks.atLeast(
            `${theme}: the morph was caught mid-fade at least once`,
            sawMidMorph,
            1,
            `${sawMidMorph} of 4 sampled scroll positions had the home still painting`,
          );
        } finally {
          await page.close();
        }
      }
    },
  },
];
