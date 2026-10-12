// The phone's navigation shell, measured: the tab bar, the Back button, the Saved and
// Profile screens, and the results sheet over a full-screen map.
//
// Every assertion is a number off getBoundingClientRect, getComputedStyle or
// elementFromPoint in a real browser with touch emulation, and every one records the
// numbers it was decided on. The jsdom suite already proves the attributes; what it
// cannot prove is that a tab is on the screen's edge, that a sheet stops where its
// detent says, or that a drag on an option row moves the sheet instead of the map.

import { sleep } from "../lib/chrome.mjs";
import { PROBE, TRIP_SEED } from "../lib/measure.mjs";

const BAR = '[data-fov="tab-bar"]';
const TABS = `${BAR} button[data-fov^="tab-"]`;
const HOME = '[data-fov="home-stage"]';
const SCROLLER = '[data-fov="home-scroller"]';
const SAVED = '[data-fov="saved-screen"]';
const PROFILE = '[data-fov="profile-screen"]';
const SHEET = '[data-fov="results-sheet"]';
const CONTENT = '[data-fov="sheet-content"]';
const HANDLE = '[data-fov="sheet-handle"]';
const COLUMN = '[data-fov="results-column"]';
const MAP = ".leaflet-container";
// The map's half of the stage: the Leaflet container and the chips MapView floats on it.
const PANE = "#fov-map-main > section";
const OPTION = '[data-fov="option"]';

// The seeded trip that plans three options (the mock answers all three modes only for a
// "zuid" destination), two more recent trips and two saved places, so the home has more
// than a screen of content and the Saved tab has rows in both of its sections.
const SEED = {
  "fov.recentTrips.v1": [
    ...TRIP_SEED["fov.recentTrips.v1"],
    { fromLabel: "De Pijp", fromQuery: "De Pijp", toLabel: "NDSM", toQuery: "NDSM", at: 1_699_999_000_000 },
    { fromLabel: "Jordaan", fromQuery: "Jordaan", toLabel: "Artis", toQuery: "Artis", at: 1_699_998_000_000 },
  ],
  "fov.savedPlaces.v1": [
    { id: "52.3660,4.9166", name: "Artis", label: "Plantage Kerklaan", lat: 52.366, lon: 4.9166, savedAt: 2 },
    { id: "52.3389,4.8730", name: "Station Zuid", label: "Amsterdam Zuid", lat: 52.3389, lon: 4.873, savedAt: 1 },
  ],
};

async function bootPhone(ctx, { width, height, seed = SEED, theme = "light", lang = "en" }) {
  const page = await ctx.openPhone({ width, height, seed, theme, lang });
  await page.goto(ctx.url);
  await page.waitFor(`document.querySelector('[data-fov="search-pill"]')`, {
    label: "the app to render its search pill",
  });
  await page.eval(PROBE);
  await page.eval(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
  return page;
}

// The bottom safe-area inset as this browser resolves it. Chrome's device emulation
// reports 0; the number is read rather than assumed so a run on a real notched device
// says what it measured.
const SAFE_BOTTOM = `
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;height:env(safe-area-inset-bottom);width:0";
  document.body.append(d);
  const v = d.getBoundingClientRect().height;
  d.remove();
  return v;
`;

async function tapOn(page, sel, label) {
  const b = await page.eval(`
    const e = document.querySelector(${JSON.stringify(sel)});
    return e ? window.__fov.rect(e) : null;
  `);
  if (!b) throw new Error(`no ${label}`);
  await page.tap(b.x + b.w / 2, b.y + b.h / 2);
  return b;
}

// The top inset, read the same way. The portrait map stage paints under the status bar,
// so every number about its floating chrome is measured from here.
const SAFE_TOP = `
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;height:env(safe-area-inset-top);width:0";
  document.body.append(d);
  const v = d.getBoundingClientRect().height;
  d.remove();
  return v;
`;

// The portrait map stage's chrome as it is on the screen: the map, the round back button,
// the pill beside it, every control in the chip row, the sheet, the reset button, and
// Leaflet's two top corners. Each control comes with what a finger at its centre reaches.
const READ_CHROME = `
  const F = window.__fov;
  const q = (s) => document.querySelector(s);
  const at = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { ...F.rect(el), cx: x, cy: y, reaches: !!hit && (hit === el || el.contains(hit)),
             hit: hit ? hit.tagName + (hit.getAttribute("data-fov") ? "[" + hit.getAttribute("data-fov") + "]" : "") : "nothing",
             opacity: Number(getComputedStyle(el).opacity) };
  };
  const chips = [...q('[data-fov="filter-bar"]').querySelectorAll("button")].map((b) => ({
    ...at(b), text: (b.textContent || "").trim() || b.getAttribute("aria-label") }));
  const corners = [...document.querySelectorAll('.leaflet-top')].map((c) => ({
    top: parseFloat(getComputedStyle(c).top), rect: F.rect(c),
    controls: [...c.querySelectorAll('.leaflet-control')].map(at) }));
  const sheet = q('${SHEET}');
  return {
    map: F.rect(q('${MAP}')), back: at(q('[data-fov="map-back"]')), pill: at(q('[data-fov="search-pill"]')),
    chips, chipTop: Math.min(...chips.map((c) => c.top)), chipBottom: Math.max(...chips.map((c) => c.bottom)),
    sheetTop: sheet.getBoundingClientRect().top, detent: sheet.getAttribute("data-detent"),
    reset: at(q('[data-fov="map-reset-view"]')), zoom: !!q('.leaflet-control-zoom'), corners,
    iw: innerWidth, ih: innerHeight,
  };
`;

// A tab screen has arrived when it is visible and its fade has finished.
const screenShown = (sel) =>
  `(() => { const e = document.querySelector('${sel}'); const cs = getComputedStyle(e);
            return cs.visibility === "visible" && cs.opacity === "1"; })()`;

// A home row, by its text, brought into view inside the home's scroller and touched where
// a finger would: the middle of what is on screen. Returns what was hit there.
async function tapHomeRow(page, text) {
  const row = await page.eval(`
    const F = window.__fov;
    const b = [...document.querySelectorAll('${HOME} button')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
    if (!b) return null;
    F.reveal(b);
    const r = F.rect(b), v = F.visible(b);
    const x = Math.round(r.x + r.w / 2), y = Math.round((v.top + v.bottom) / 2);
    const at = document.elementFromPoint(x, y);
    return { x, y, inside: !!at && b.contains(at), visible: v.h };
  `);
  if (!row) throw new Error(`no "${text}" row on the home`);
  await page.tap(row.x, row.y);
  return row;
}

// Plan the seeded three-option trip and wait for the map stage and the sheet at half.
async function planToSheet(page) {
  await tapHomeRow(page, "Zuidplein");
  await page.waitFor(`document.querySelectorAll('${OPTION}').length >= 3`, { label: "three travel options" });
  await page.waitFor(`Math.round(window.scrollY) === innerHeight`, { label: "the morph to reach the map stage" });
  return sheetAt(page, "half");
}

// The sheet as it is on the screen. `visible` is how much of it shows above the foot of
// the map stage's main, which is what each detent's height means.
const READ_SHEET = `
  const F = window.__fov;
  const sheet = document.querySelector('${SHEET}');
  if (!sheet) return null;
  const main = document.querySelector('#fov-map-main').getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  const content = document.querySelector('${CONTENT}');
  return {
    detent: sheet.getAttribute("data-detent"),
    top: +s.top.toFixed(2),
    visible: +(main.bottom - s.top).toFixed(2),
    main: { top: +main.top.toFixed(2), bottom: +main.bottom.toFixed(2), h: +main.height.toFixed(2) },
    handle: F.rect(document.querySelector('${HANDLE}')),
    content: { ...F.visible(content), scrollTop: content.scrollTop, scrollHeight: content.scrollHeight,
               clientHeight: content.clientHeight },
    iw: innerWidth, ih: innerHeight,
  };
`;

// Wait for a detent, then for the settle animation to stop moving the sheet.
async function sheetAt(page, detent, { timeout = 8000 } = {}) {
  await page.waitFor(`document.querySelector('${SHEET}[data-detent="${detent}"]')`, {
    label: `the sheet at ${detent}`,
    timeout,
  });
  let last = null;
  for (let i = 0; i < 40; i++) {
    const top = await page.eval(`return document.querySelector('${SHEET}').getBoundingClientRect().top;`);
    if (last !== null && Math.abs(top - last) < 0.5) break;
    last = top;
    await sleep(80);
  }
  return page.eval(READ_SHEET);
}

// The middle of the on-screen part of the n-th option row.
async function optionPoint(page, n) {
  return page.eval(`
    const F = window.__fov;
    const li = document.querySelectorAll('${OPTION}')[${n}];
    const r = F.rect(li), v = F.visible(li);
    return { x: Math.round(r.x + r.w / 2), y: Math.round((v.top + v.bottom) / 2), visible: v.h, h: r.h,
             selected: li.getAttribute("data-selected") === "true",
             title: li.querySelector('[data-fov="option-title"]').textContent.trim() };
  `);
}

export const scenarios = [
  {
    name: "390x844 the tab bar sits on the bottom edge, above the safe area, clear of the home",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        const safe = await page.eval(SAFE_BOTTOM);
        const m = await page.eval(`
          const F = window.__fov;
          const bar = document.querySelector('${BAR}');
          return { bar: F.rect(bar), padBottom: parseFloat(getComputedStyle(bar).paddingBottom),
                   tabs: [...document.querySelectorAll('${TABS}')].map((b) => ({ ...F.rect(b), name: b.getAttribute("data-fov") })),
                   ih: innerHeight, iw: innerWidth };
        `);
        checks.equal("the bar's bottom edge is the screen's", Math.round(m.bar.bottom), m.ih, `bar ${m.bar.top}..${m.bar.bottom}`);
        checks.equal("the bar spans the screen", Math.round(m.bar.w), m.iw);
        checks.equal(
          "the bar is 56px tall above the bottom inset",
          Math.round(m.bar.h - m.padBottom),
          56,
          `bar ${m.bar.h}px, of which ${m.padBottom}px is the inset (env resolves to ${safe}px here)`,
        );
        checks.equal("the bar has three tabs", m.tabs.length, 3, m.tabs.map((t) => t.name).join(", "));
        for (const t of m.tabs) {
          checks.atLeast(`${t.name} clears a 44px finger`, t.h, 44, `${t.w}x${t.h}`);
          const hit = await page.eval(
            `return window.__fov.hit(${Math.round(t.x + t.w / 2)}, ${Math.round(t.y + t.h / 2)}, '[data-fov="${t.name}"]');`,
          );
          checks.ok(`a touch at the middle of ${t.name} reaches it`, hit.inside, `hit ${hit.desc}`);
        }

        // The home's scroller ends where the bar starts: its box, not just its content.
        // When the box ran under the bar, a touch on a card half above the bar's edge
        // reached a tab.
        const s = await page.eval(`
          const F = window.__fov;
          const sc = document.querySelector('${SCROLLER}');
          sc.scrollTop = sc.scrollHeight;
          const buttons = [...sc.querySelectorAll("button")];
          const last = buttons[buttons.length - 1];
          const r = F.rect(last);
          const at = document.elementFromPoint(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2));
          const box = F.rect(sc);
          const above = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(box.bottom - 3));
          return { box, scrolled: sc.scrollTop, room: sc.scrollHeight - sc.clientHeight, last: r,
                   lastText: last.textContent.trim().slice(0, 20), reached: !!at && last.contains(at),
                   aboveEdge: !!above && sc.contains(above) };
        `);
        checks.atLeast("the home has more than a screen to scroll", s.room, 1, `${s.room}px past the box, scrolled ${s.scrolled}`);
        checks.near(
          "the home's scroller ends at the bar's top edge",
          s.box.bottom,
          m.bar.top,
          0.5,
          `scroller ${s.box.top}..${s.box.bottom}, bar from ${m.bar.top}`,
        );
        checks.atMost(
          "scrolled to its end, the home's last control is above the bar",
          s.last.bottom,
          m.bar.top,
          `"${s.lastText}" ends at ${s.last.bottom}, bar from ${m.bar.top}`,
        );
        checks.ok("and a touch on it reaches it", s.reached, `"${s.lastText}" at ${s.last.top}..${s.last.bottom}`);
        checks.ok("a touch 3px above the bar's edge lands in the home, not the bar", s.aboveEdge, `scroller bottom ${s.box.bottom}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 Saved covers the screen and Back returns to Plan",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        const before = await page.eval(`return history.length;`);
        await tapOn(page, '[data-fov="tab-saved"]', "Saved tab");
        await page.waitFor(screenShown(SAVED), { label: "the Saved screen" });
        const open = await page.eval(`
          const F = window.__fov;
          return { centre: F.hit(Math.round(innerWidth / 2), Math.round(innerHeight / 2), '${SAVED}'),
                   top: F.hit(Math.round(innerWidth / 2), 40, '${SAVED}'),
                   box: F.rect(document.querySelector('${SAVED}')),
                   length: history.length,
                   current: document.querySelector('[data-fov="tab-saved"]').getAttribute("aria-current"),
                   homeInert: document.querySelector('${HOME}').hasAttribute("inert") };
        `);
        checks.ok("the middle of the screen belongs to Saved", open.centre.inside, `hit ${open.centre.desc}`);
        checks.ok("so does its top", open.top.inside, `hit ${open.top.desc}`);
        checks.equal("Saved covers the whole screen", `${open.box.w}x${open.box.h}`, "390x844", `at (${open.box.x}, ${open.box.y})`);
        checks.equal("opening Saved added one history entry", open.length, before + 1, `history.length ${before} -> ${open.length}`);
        checks.equal("the Saved tab is the current one", open.current, "page");
        checks.ok("the home is inert under Saved", open.homeInert, `inert ${open.homeInert}`);

        await page.eval(`history.back(); return null;`);
        await page.waitFor(`getComputedStyle(document.querySelector('${SAVED}')).visibility === "hidden"`, {
          label: "Saved to close on Back",
        });
        await sleep(200);
        const back = await page.eval(`
          const F = window.__fov;
          return { centre: F.hit(Math.round(innerWidth / 2), Math.round(innerHeight / 2), '${HOME}'),
                   current: document.querySelector('[data-fov="tab-plan"]').getAttribute("aria-current"),
                   scrollY: Math.round(scrollY), href: location.href };
        `);
        checks.ok("after Back the middle of the screen is the home again", back.centre.inside, `hit ${back.centre.desc}`);
        checks.equal("Plan is the current tab again", back.current, "page");
        checks.equal("the app is still on its home stage", back.scrollY, 0, back.href);
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 a planned trip opens the sheet at half, the map above it takes touches",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        const card = await page.eval(`
          const F = window.__fov;
          const c = document.querySelector('[data-fov="popular-trip"]');
          F.reveal(c);
          const r = F.rect(c), v = F.visible(c);
          const x = Math.round(r.x + r.w / 2), y = Math.round((v.top + v.bottom) / 2);
          return { x, y, label: c.getAttribute("aria-label"), hit: F.hit(x, y, '[data-fov="popular-trip"]') };
        `);
        checks.ok("a touch on the first popular trip reaches it", card.hit.inside, `"${card.label}", hit ${card.hit.desc}`);
        await page.tap(card.x, card.y);
        await page.waitFor(`Math.round(window.scrollY) === innerHeight`, { label: "the morph to reach the map stage" });
        const s = await sheetAt(page, "half");
        checks.equal("the plan lands with the sheet at half", s.detent, "half");
        checks.near(
          "the sheet shows half the screen",
          s.visible,
          Math.round(s.ih * 0.5),
          2,
          `sheet top ${s.top}, main ends ${s.main.bottom}: ${s.visible}px of a ${s.ih}px screen`,
        );
        // 40px above the sheet, in the middle, is where the map's own hint chip sits:
        // MapView lifts its chip column by the sheet's height so the chips stay on the
        // map. So the middle is asked for the map pane (map and chips, not the sheet),
        // and a second touch at the left, clear of that column, for the map itself.
        const above = await page.eval(`
          const F = window.__fov;
          const x = Math.round(innerWidth / 2), y = Math.round(${s.top} - 40);
          const bar = document.querySelector('${BAR}');
          return { x, y, pane: F.hit(x, y, '${PANE}'), sheet: F.hit(x, y, '${SHEET}'), left: F.hit(40, y, '${MAP}'),
                   barTop: bar.getBoundingClientRect().top, barHidden: bar.getAttribute("aria-hidden") };
        `);
        checks.ok(
          "40px above the sheet a touch reaches the map pane, not the sheet",
          above.pane.inside && !above.sheet.inside,
          `elementFromPoint(${above.x}, ${above.y}) = ${above.pane.desc} "${above.pane.text}"`,
        );
        checks.ok(
          "and clear of the map's chips it reaches the map itself",
          above.left.inside,
          `elementFromPoint(40, ${above.y}) = ${above.left.desc}`,
        );
        checks.atLeast(
          "the tab bar has left the bottom edge to the sheet",
          above.barTop,
          s.ih - 1,
          `bar top ${above.barTop} of ${s.ih}, aria-hidden ${above.barHidden}`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "390x844 the sheet follows a drag and the Back button",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        const safe = await page.eval(SAFE_BOTTOM);
        const half = await planToSheet(page);
        const bar = await page.eval(`return window.__fov.rect(document.querySelector('[data-fov="filter-bar"]'));`);
        const x = Math.round(half.iw / 2);
        const grip = Math.round(half.handle.y + half.handle.h / 2);
        await page.swipe(x, grip, Math.round(bar.bottom + 10));
        const full = await sheetAt(page, "full");
        checks.equal("dragging the handle up takes the sheet to full", full.detent, "full", `from y ${grip} to ${Math.round(bar.bottom + 10)}`);
        // The map runs to the top of the screen under the floating chrome, so the space
        // under the filter bar is no longer where main starts: it starts 8px under the
        // chip row, where the sheet's frame does.
        checks.near(
          "at full the sheet fills the space under the filter bar",
          full.top,
          bar.bottom + 8,
          2,
          `sheet top ${full.top}, filter bar ends ${bar.bottom}, main starts ${full.main.top}`,
        );

        await page.eval(`history.back(); return null;`);
        const back = await sheetAt(page, "half");
        checks.equal("Back drops a full sheet to half", back.detent, "half");
        checks.near("and half is half the screen again", back.visible, Math.round(back.ih * 0.5), 2, `${back.visible}px`);
        const stage = await page.eval(`return Math.round(scrollY);`);
        checks.equal("Back did not leave the map stage", stage, back.ih, `scrollY ${stage}`);

        const grip2 = Math.round(back.handle.y + back.handle.h / 2);
        await page.swipe(x, grip2, back.ih - 20);
        const peek = await sheetAt(page, "peek");
        checks.equal("dragging the handle down takes the sheet to its peek", peek.detent, "peek", `from y ${grip2} to ${back.ih - 20}`);
        checks.near(
          "the peek is 132px above the bottom inset",
          peek.visible,
          132 + safe,
          2,
          `${peek.visible}px showing, inset ${safe}px`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    // On the sheet at half the content does not scroll, so a drag that starts on an
    // option row has to move the sheet. A tap on the same row still has to choose it.
    name: "390x844 drag from an option row moves the sheet; a tap selects it",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await planToSheet(page);
        const row = await optionPoint(page, 1);
        checks.atLeast("the second option is on the half sheet", row.visible, 44, `${row.visible} of ${row.h}px of "${row.title}"`);
        checks.ok("the second option is not the chosen one yet", !row.selected, row.title);

        await page.swipe(row.x, row.y, row.y - 200);
        const full = await sheetAt(page, "full");
        checks.equal("a 200px drag up from the option row takes the sheet to full", full.detent, "full", `from y ${row.y}`);
        const after = await optionPoint(page, 1);
        checks.ok("the drag did not choose the row it started on", !after.selected, `"${after.title}" selected ${after.selected}`);

        await page.eval(`history.back(); return null;`);
        await sheetAt(page, "half");
        const target = await optionPoint(page, 1);
        await page.tap(target.x, target.y);
        await sleep(400);
        const tapped = await optionPoint(page, 1);
        const s = await page.eval(READ_SHEET);
        checks.ok("a tap on the same row chooses it", tapped.selected, `"${tapped.title}" at (${target.x}, ${target.y})`);
        checks.equal("and leaves the sheet where it was", s.detent, "half", `${s.visible}px showing`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // Chrome sends no click after a touch that moved past its tap slop, so nothing that
    // waits for a drag's click to come can be left waiting: it would take the next real
    // tap instead. Measured before the fix: swiped to full, the first tap on the handle
    // left the sheet at full and only the second one moved it.
    name: "390x844 after a drag, the next tap on the handle still moves the sheet",
    async run(ctx) {
      const { checks } = ctx;
      const detentNot = (d) => `document.querySelector('${SHEET}').getAttribute("data-detent") !== "${d}"`;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        const half = await planToSheet(page);
        const bar = await page.eval(`return window.__fov.rect(document.querySelector('[data-fov="filter-bar"]'));`);
        const x = Math.round(half.iw / 2);
        const grip = Math.round(half.handle.y + half.handle.h / 2);
        await page.swipe(x, grip, Math.round(bar.bottom + 10));
        const full = await sheetAt(page, "full");
        checks.equal("a drag on the handle takes the sheet to full", full.detent, "full", `from y ${grip}`);
        const at = Math.round(full.handle.y + full.handle.h / 2);
        await page.tap(x, at);
        await page.waitFor(detentNot("full"), { label: "the sheet to leave full", timeout: 3000 }).catch(() => {});
        const tapped = await page.eval(READ_SHEET);
        checks.equal("one tap on the handle then moves it from full to peek", tapped.detent, "peek", `tap at (${x}, ${at})`);
      } finally {
        await page.close();
      }

      const page2 = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await planToSheet(page2);
        const row = await optionPoint(page2, 1);
        await page2.swipe(row.x, row.y, row.y - 200);
        const full = await sheetAt(page2, "full");
        checks.equal("a drag from an option row takes the sheet to full", full.detent, "full", `from y ${row.y}`);
        await page2.eval(`history.back(); return null;`);
        const back = await sheetAt(page2, "half");
        checks.equal("Back drops it to half", back.detent, "half");
        const x = Math.round(back.iw / 2);
        const at = Math.round(back.handle.y + back.handle.h / 2);
        await page2.tap(x, at);
        await page2.waitFor(detentNot("half"), { label: "the sheet to leave half", timeout: 3000 }).catch(() => {});
        const tapped = await page2.eval(READ_SHEET);
        checks.equal("one tap on the handle then moves it from half to full", tapped.detent, "full", `tap at (${x}, ${at})`);
      } finally {
        await page2.close();
      }
    },
  },

  {
    // The hand-off: at full the content scrolls, and the sheet takes a downward drag
    // back only once the content is at its top.
    name: "390x844 at full the content scrolls, and pulls the sheet down only from its top",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844 });
      try {
        await planToSheet(page);
        const handle = await tapOn(page, HANDLE, "sheet handle");
        let s = await sheetAt(page, "full");
        checks.equal("a tap on the handle at half takes the sheet to full", s.detent, "full", `handle at y ${Math.round(handle.y)}`);
        // The chosen option's steps start folded; open them so the content is taller
        // than the sheet and has somewhere to scroll.
        const toggle = await page.eval(`
          const t = document.querySelector('${CONTENT} [data-fov="steps-toggle"]');
          return t ? window.__fov.rect(t) : null;
        `);
        if (toggle) {
          await page.tap(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
          await sleep(300);
        }
        s = await page.eval(READ_SHEET);
        checks.atLeast(
          "at full the content has more than 100px to scroll",
          s.content.scrollHeight - s.content.clientHeight,
          100,
          `${s.content.scrollHeight}px of content in ${s.content.clientHeight}px`,
        );

        const x = Math.round(s.iw / 2);
        const y = Math.round(s.content.top + 150);
        const from = await page.eval(`const c = document.querySelector('${CONTENT}'); c.scrollTop = 100; return c.scrollTop;`);
        await page.swipe(x, y, y + 150);
        const scrolled = await page.eval(READ_SHEET);
        checks.equal("a drag down on scrolled content leaves the sheet at full", scrolled.detent, "full");
        checks.atMost(
          "and scrolls the content back towards its top",
          scrolled.content.scrollTop,
          from - 1,
          `scrollTop ${from} -> ${scrolled.content.scrollTop} across a 150px drag`,
        );

        await page.eval(`document.querySelector('${CONTENT}').scrollTop = 0; return null;`);
        await sleep(100);
        await page.swipe(x, y, y + 250);
        await page.waitFor(`document.querySelector('${SHEET}').getAttribute("data-detent") !== "full"`, {
          label: "the sheet to leave full",
          timeout: 3000,
        }).catch(() => {});
        const pulled = await page.eval(READ_SHEET);
        checks.ok(
          "from the content's top the same drag pulls the sheet down",
          pulled.detent === "half" || pulled.detent === "peek",
          `detent ${pulled.detent}, ${pulled.visible}px showing after a 250px drag`,
        );
      } finally {
        await page.close();
      }
    },
  },

  {
    name: "360x800 Profile switches theme with no layout jump",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 360, height: 800 });
      try {
        await tapOn(page, '[data-fov="tab-profile"]', "Profile tab");
        await page.waitFor(screenShown(PROFILE), { label: "the Profile screen" });
        const read = `
          const F = window.__fov;
          const screen = document.querySelector('${PROFILE}');
          const dark = [...screen.querySelectorAll('[role="group"] button')].find((b) => b.textContent.trim() === "Dark");
          return { scrollTop: screen.scrollTop, heading: F.rect(screen.querySelector("h1")),
                   group: F.rect(dark.closest('[role="group"]')), dark: F.rect(dark),
                   pressed: dark.getAttribute("aria-pressed"),
                   isDark: document.documentElement.classList.contains("dark") };
        `;
        const before = await page.eval(read);
        checks.ok("the page starts in the light theme", !before.isDark, `html.dark ${before.isDark}`);
        await page.tap(before.dark.x + before.dark.w / 2, before.dark.y + before.dark.h / 2);
        await page.waitFor(`document.documentElement.classList.contains("dark")`, { label: "the dark theme" });
        await page.waitFor(`!document.documentElement.classList.contains("theme-switching")`, {
          label: "the theme reveal to finish",
        });
        await sleep(200);
        const after = await page.eval(read);
        checks.ok("Dark is the chosen theme", after.pressed === "true", `aria-pressed ${after.pressed}`);
        checks.equal("the Profile screen kept its scroll", after.scrollTop, before.scrollTop);
        checks.near("the title did not move", after.heading.top, before.heading.top, 0.5, `${before.heading.top} -> ${after.heading.top}`);
        checks.near("the theme control did not move", after.group.top, before.group.top, 0.5, `${before.group.top} -> ${after.group.top}`);
        checks.near("nor change height", after.group.h, before.group.h, 0.5, `${before.group.h} -> ${after.group.h}`);
      } finally {
        await page.close();
      }
    },
  },

  {
    // A saved place tapped on the Saved tab switches to Plan, which is a history.back()
    // of the app's own, and opens the search screen, whose entry is pushed once that
    // step has landed. A Back pressed as the finger lifts arrives while the app's step
    // may still be travelling, and has to close the search screen without leaving the
    // app. (A Back in the very same task as the tap, which no finger can produce, does
    // leave it in Chrome: both steps are applied. jsdom drops that Back instead.)
    name: "390x844 a Back as the finger lifts off a Saved row closes the search it opened",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 390, height: 844, seed: { "fov.savedPlaces.v1": SEED["fov.savedPlaces.v1"] } });
      try {
        await tapOn(page, '[data-fov="tab-saved"]', "Saved tab");
        await page.waitFor(screenShown(SAVED), { label: "the Saved screen" });
        const row = await page.eval(`
          const b = [...document.querySelectorAll('${SAVED} button')].find((x) => x.textContent.includes("Artis"));
          return b ? window.__fov.rect(b) : null;
        `);
        if (!row) throw new Error("no Artis row on the Saved screen");
        const [x, y] = [row.x + row.w / 2, row.y + row.h / 2];
        await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });
        await sleep(50);
        await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.eval(`history.back(); return null;`);
        await sleep(1200);
        const m = await page.eval(`
          const F = window.__fov;
          return { href: location.href, search: !!document.querySelector('[data-fov="search-sheet"]'),
                   current: document.querySelector('${BAR} [aria-current="page"]')?.getAttribute("data-fov"),
                   saved: getComputedStyle(document.querySelector('${SAVED}')).visibility,
                   centre: F.hit(Math.round(innerWidth / 2), Math.round(innerHeight / 2), '${HOME}'),
                   entry: JSON.stringify(history.state) };
        `);
        checks.ok("the app is still the page", m.href.startsWith(ctx.url), m.href);
        checks.ok("Back closed the search screen", !m.search, `search sheet mounted ${m.search}`);
        checks.equal("Plan is the current tab", m.current, "tab-plan", `Saved screen ${m.saved}`);
        checks.ok("the home is what is on the screen", m.centre.inside, `hit ${m.centre.desc}, entry ${m.entry}`);
      } finally {
        await page.close();
      }
    },
  },

  // The portrait map stage, Google Maps' shape: the map runs to the top of the screen and
  // the chrome floats over it. Before, at 390x844, a 56px header bar, the pill on a row of
  // its own under it and the filter bar in flow put the map's top at 200px, and the map
  // showed 222px between that and the half sheet.
  ...[
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ].map(({ width, height }) => ({
    name: `${width}x${height} the map runs to the top edge under floating chrome`,
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width, height });
      try {
        const inset = await page.eval(SAFE_TOP);
        await planToSheet(page);
        await sleep(300);
        const m = await page.eval(READ_CHROME);

        checks.near("the map pane's top is the screen's", m.map.top, 0, 0.5, `map ${m.map.top}..${m.map.bottom}`);
        checks.near("and it runs to the foot of the screen", m.map.bottom, m.ih, 0.5, `map ends ${m.map.bottom} of ${m.ih}`);

        checks.near("the back button floats 8px under the top inset", m.back.top, inset + 8, 0.5, `top ${m.back.top}, inset ${inset}`);
        checks.atLeast("the back button is 44px tall", m.back.h, 44, `${m.back.w}x${m.back.h}`);
        checks.atLeast("and 44px wide", m.back.w, 44, `${m.back.w}x${m.back.h}`);
        checks.ok("a touch at its centre reaches it", m.back.reaches, `elementFromPoint(${m.back.cx}, ${m.back.cy}) = ${m.back.hit}`);

        checks.near("the pill rests on the back button's row", m.pill.top, m.back.top, 0.5, `pill top ${m.pill.top}, back top ${m.back.top}`);
        checks.near("about as tall as the back button", m.pill.h, 48, 2, `${m.pill.h}px`);
        checks.atLeast("and clear of it to the right", m.pill.left, m.back.right + 4, `pill from ${m.pill.left}, back ends ${m.back.right}`);
        checks.ok("a touch at the pill's centre reaches it", m.pill.reaches, `elementFromPoint(${m.pill.cx}, ${m.pill.cy}) = ${m.pill.hit}`);

        checks.atLeast("the chip row starts under the pill", m.chipTop, m.pill.bottom, `chips from ${m.chipTop}, pill ends ${m.pill.bottom}`);
        checks.atMost(
          "the chip row ends within 116px of the top inset",
          m.chipBottom,
          inset + 116,
          `chips end ${m.chipBottom}, inset ${inset}`,
        );
        const lastChip = m.chips[m.chips.length - 1];
        checks.equal("Map is the last chip", lastChip.text, "Map", m.chips.map((c) => c.text).join(", "));
        for (const c of m.chips) {
          checks.atLeast(`"${c.text}" is 44px tall`, c.h, 44, `${c.w}x${c.h}`);
          checks.atLeast(`"${c.text}" is 44px wide`, c.w, 44, `${c.w}x${c.h}`);
          checks.ok(`a touch at the centre of "${c.text}" reaches it`, c.reaches, `elementFromPoint(${c.cx}, ${c.cy}) = ${c.hit}`);
        }

        // Between the chips and the half sheet the screen is map, and takes a touch as one.
        const band = await page.eval(`
          const F = window.__fov;
          const y = Math.round((${m.chipBottom} + ${m.sheetTop}) / 2);
          return { y, left: F.hit(40, y, '${MAP}'), middle: F.hit(Math.round(innerWidth / 2), y, '${MAP}'),
                   besideChips: F.hit(innerWidth - 8, Math.round(${m.chipTop} + 22), '${MAP}') };
        `);
        checks.ok("a touch on the map under the chips reaches the map", band.left.inside, `elementFromPoint(40, ${band.y}) = ${band.left.desc}`);
        checks.ok("in the middle of the screen too", band.middle.inside, `elementFromPoint(${Math.round(m.iw / 2)}, ${band.y}) = ${band.middle.desc}`);
        checks.ok(
          "and beside a row that does not fill the screen, the map takes the touch",
          band.besideChips.inside,
          `elementFromPoint(${m.iw - 8}, ${Math.round(m.chipTop + 22)}) = ${band.besideChips.desc}`,
        );
        // All of the upper half of the screen but the floating rows is map. Before, the
        // map pane started at 200px under a header, a pill and a filter bar, which left it
        // 222px above the half sheet at 390x844 and 200px at 360x800.
        checks.atLeast(
          "the map shows the upper half of the screen, less the chrome rows",
          m.sheetTop - m.chipBottom,
          m.ih / 2 - inset - 116,
          `chips end ${m.chipBottom}, sheet starts ${m.sheetTop}: ${Math.round(m.sheetTop - m.chipBottom)}px of map`,
        );

        checks.ok("there are no zoom buttons: the map zooms by pinch", !m.zoom, m.zoom ? "a .leaflet-control-zoom is drawn" : "none");
        checks.atMost("the reset button sits above the sheet", m.reset.bottom, m.sheetTop, `button ends ${m.reset.bottom}, sheet starts ${m.sheetTop}`);
        checks.near("at the right edge", m.reset.right, m.iw - 12, 0.5, `button ends at x ${m.reset.right}`);
        checks.atLeast("it is 44px tall", m.reset.h, 44, `${m.reset.w}x${m.reset.h}`);
        checks.atLeast("and 44px wide", m.reset.w, 44, `${m.reset.w}x${m.reset.h}`);
        checks.ok("a touch at its centre reaches it", m.reset.reaches, `elementFromPoint(${m.reset.cx}, ${m.reset.cy}) = ${m.reset.hit}`);

        for (const [i, c] of m.corners.entries()) {
          checks.atLeast(`Leaflet's top corner ${i + 1} starts under the chips`, c.rect.top, m.chipBottom, `corner top ${c.rect.top} (css ${c.top}px)`);
          for (const ctl of c.controls) {
            checks.ok(`a control in that corner is not under the chrome`, ctl.reaches, `elementFromPoint(${ctl.cx}, ${ctl.cy}) = ${ctl.hit}`);
          }
        }

        // The radar's readout pins itself to the top right of the map: under the chips.
        const more = m.chips[m.chips.length - 1];
        await page.tap(more.cx, more.cy);
        await page.waitFor(`document.querySelector('[data-fov="filter-panel"]')`, { label: "the map tools panel" });
        const radar = await page.eval(`
          const b = [...document.querySelectorAll('[data-fov="filter-panel"] button')].find((x) => x.textContent.trim() === "Radar");
          return b ? window.__fov.rect(b) : null;
        `);
        if (!radar) throw new Error("no Radar row in the map tools");
        await page.tap(radar.x + radar.w / 2, radar.y + radar.h / 2);
        await page.tap(more.cx, more.cy);
        await page.waitFor(`!document.querySelector('[data-fov="filter-panel"]')`, { label: "the map tools to close" });
        await page.waitFor(
          `[...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Rain")`,
          { label: "the radar readout" },
        );
        const readout = await page.eval(`
          const F = window.__fov;
          const rain = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Rain");
          const wind = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Wind");
          const box = rain.closest(".right-3");
          const hitOf = (b) => { const r = b.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
                                 const h = document.elementFromPoint(x, y); return { x, y, inside: !!h && b.contains(h), tag: h ? h.tagName : "nothing" }; };
          return { box: F.rect(box), rain: hitOf(rain), wind: hitOf(wind) };
        `);
        checks.atLeast("the radar readout starts under the chips", readout.box.top, m.chipBottom, `readout from ${readout.box.top}, chips end ${m.chipBottom}`);
        checks.ok("its Rain toggle takes a touch", readout.rain.inside, `elementFromPoint(${readout.rain.x}, ${readout.rain.y}) = ${readout.rain.tag}`);
        checks.ok("and so does Wind", readout.wind.inside, `elementFromPoint(${readout.wind.x}, ${readout.wind.y}) = ${readout.wind.tag}`);

        // At full the sheet stops under the chips, not under the pill, and the map tools
        // still open over it: the chip row's layer is above the sheet's.
        const half = await page.eval(READ_SHEET);
        await page.tap(Math.round(half.iw / 2), Math.round(half.handle.y + half.handle.h / 2));
        const full = await sheetAt(page, "full");
        checks.near("at full the sheet starts 8px under the chips", full.top, m.chipBottom + 8, 1, `sheet top ${full.top}, chips end ${m.chipBottom}`);
        await page.tap(more.cx, more.cy);
        await page.waitFor(`document.querySelector('[data-fov="filter-panel"]')`, { label: "the map tools panel over a full sheet" });
        const panel = await page.eval(`
          const F = window.__fov;
          const p = document.querySelector('[data-fov="filter-panel"]');
          const rows = [...p.querySelectorAll("button")].map((b) => {
            const r = b.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const h = document.elementFromPoint(x, y);
            return { text: b.textContent.trim(), x, y, inside: !!h && b.contains(h), tag: h ? h.tagName : "nothing" };
          });
          return { rect: F.rect(p), rows };
        `);
        checks.ok(
          "over a full sheet the map tools open whole on the screen",
          panel.rect.left >= 0 && panel.rect.right <= m.iw && panel.rect.top >= 0 && panel.rect.bottom <= m.ih,
          `panel ${panel.rect.left}..${panel.rect.right} x ${panel.rect.top}..${panel.rect.bottom}`,
        );
        for (const r of panel.rows) {
          checks.ok(`and "${r.text}" in them takes a touch`, r.inside, `elementFromPoint(${r.x}, ${r.y}) = ${r.tag}`);
        }
        await page.tap(more.cx, more.cy);
        await page.waitFor(`!document.querySelector('[data-fov="filter-panel"]')`, { label: "the map tools to close" });

        // A touch between the chips and the sheet is a touch on the map: armed to set the
        // start, it moves the trip's start to where it landed.
        await page.eval(`history.back(); return null;`);
        const back = await sheetAt(page, "half");
        await page.tap(more.cx, more.cy);
        await page.waitFor(`document.querySelector('[data-fov="filter-panel"]')`, { label: "the map tools panel" });
        const startRow = await page.eval(`
          const b = [...document.querySelectorAll('[data-fov="filter-panel"] button')].find((x) => x.textContent.trim() === "Start");
          return b ? window.__fov.rect(b) : null;
        `);
        if (!startRow) throw new Error("no Start row in the map tools");
        await page.tap(startRow.x + startRow.w / 2, startRow.y + startRow.h / 2);
        await page.waitFor(`!document.querySelector('[data-fov="filter-panel"]')`, { label: "the panel to close on arming" });
        const label = `document.querySelector('[data-fov="search-entry"]').textContent`;
        const before = await page.eval(`return ${label};`);
        const y = Math.round((m.chipBottom + back.top) / 2);
        await page.tap(40, y);
        let moved = true;
        await page
          .waitFor(`!${label}.includes("Amsterdam Centraal")`, { label: "the start to move", timeout: 4000 })
          .catch(() => {
            moved = false;
          });
        const after = await page.eval(`return ${label};`);
        checks.ok("a tap on the map under the chips lands on the map", moved, `tap at (40, ${y}): "${before}" -> "${after}"`);
      } finally {
        await page.close();
      }
    },
  })),

  ...[
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ].map(({ width, height }) => ({
    name: `${width}x${height} navigation takes the top of the map for its banner`,
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width, height });
      try {
        const inset = await page.eval(SAFE_TOP);
        await planToSheet(page);
        const chrome = await page.eval(READ_CHROME);
        // On a phone the Start button is inside the chosen option's folded steps.
        await tapOn(page, `${CONTENT} [data-fov="steps-toggle"]`, "the chosen option's steps toggle");
        await page.waitFor(`document.querySelector('${CONTENT} details[open] [aria-label="Start navigation"]')`, {
          label: "the steps to open",
        });
        await sleep(300);
        const start = await page.eval(`
          const F = window.__fov;
          const b = document.querySelector('${CONTENT} [aria-label="Start navigation"]');
          if (!b) return null;
          F.reveal(b);
          const r = F.rect(b), v = F.visible(b);
          return { x: Math.round(r.x + r.w / 2), y: Math.round((v.top + v.bottom) / 2), visible: v.h };
        `);
        if (!start) throw new Error("no Start navigation button in the sheet");
        checks.atLeast("the Start button is on the half sheet", start.visible, 44, `${start.visible}px of it showing`);
        await page.tap(start.x, start.y);
        await page.waitFor(`document.querySelector('[aria-label="Exit navigation"]')`, { label: "the navigation banner" });
        await sleep(600);
        const m = await page.eval(`
          const F = window.__fov;
          const exit = document.querySelector('[aria-label="Exit navigation"]');
          const banner = exit.closest(".rounded-card");
          const r = exit.getBoundingClientRect();
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
          const h = document.elementFromPoint(x, y);
          const probe = (cx, cy, sel) => { const e = document.elementFromPoint(cx, cy); return { inside: !!e && !!e.closest(sel), tag: e ? e.tagName : "nothing" }; };
          return {
            banner: F.rect(banner), exit: { x, y, inside: !!h && exit.contains(h), tag: h ? h.tagName : "nothing" },
            pill: { opacity: Number(getComputedStyle(document.querySelector('[data-fov="search-pill"]')).opacity),
                    hit: probe(${chrome.pill.cx}, ${chrome.pill.cy}, '[data-fov="search-pill"]') },
            chips: { opacity: Number(getComputedStyle(document.querySelector('[data-fov="map-chrome"]')).opacity),
                     hit: probe(${chrome.chips[0].cx}, ${chrome.chips[0].cy}, '[data-fov="filter-bar"]') },
            back: { hit: probe(${chrome.back.cx}, ${chrome.back.cy}, '[data-fov="map-back"]') },
            iw: innerWidth, ih: innerHeight,
          };
        `);
        checks.near("the banner starts 8px under the top inset", m.banner.top, inset + 8, 0.5, `banner ${m.banner.top}..${m.banner.bottom}, inset ${inset}`);
        checks.ok(
          "and is whole on the screen",
          m.banner.top >= inset && m.banner.bottom <= m.ih && m.banner.left >= 0 && m.banner.right <= m.iw,
          `banner ${m.banner.left}..${m.banner.right} x ${m.banner.top}..${m.banner.bottom} in ${m.iw}x${m.ih}`,
        );
        checks.ok("a touch on Exit reaches it", m.exit.inside, `elementFromPoint(${m.exit.x}, ${m.exit.y}) = ${m.exit.tag}`);
        checks.equal("the pill has stepped aside", m.pill.opacity, 0, `opacity ${m.pill.opacity}`);
        checks.ok("and a touch where it was does not reach it", !m.pill.hit.inside, `hit ${m.pill.hit.tag}`);
        checks.equal("so have the chips", m.chips.opacity, 0, `opacity ${m.chips.opacity}`);
        checks.ok("and a touch where they were does not reach them", !m.chips.hit.inside, `hit ${m.chips.hit.tag}`);
        checks.ok("nor does one where the back button was", !m.back.hit.inside, `hit ${m.back.hit.tag}`);

        await page.tap(m.exit.x, m.exit.y);
        await page.waitFor(`!document.querySelector('[aria-label="Exit navigation"]')`, { label: "navigation to end" });
        await sleep(500);
        const after = await page.eval(READ_CHROME);
        checks.ok("after Exit the pill takes a touch again", after.pill.reaches, `elementFromPoint(${after.pill.cx}, ${after.pill.cy}) = ${after.pill.hit}`);
        checks.ok("and so does the first chip", after.chips[0].reaches, `elementFromPoint(${after.chips[0].cx}, ${after.chips[0].cy}) = ${after.chips[0].hit}`);
      } finally {
        await page.close();
      }
    },
  })),

  {
    name: "844x390 landscape keeps the side-by-side panes and a compact bar",
    async run(ctx) {
      const { checks } = ctx;
      const page = await bootPhone(ctx, { width: 844, height: 390 });
      try {
        const safe = await page.eval(SAFE_BOTTOM);
        const bar = await page.eval(`
          const F = window.__fov;
          const bar = document.querySelector('${BAR}');
          return { ...F.rect(bar), padBottom: parseFloat(getComputedStyle(bar).paddingBottom),
                   tabs: [...document.querySelectorAll('${TABS}')].map((b) => ({ h: F.rect(b).h, label: b.getAttribute("aria-label") })),
                   ih: innerHeight };
        `);
        checks.near("the landscape bar is 44px plus the bottom inset", bar.h, 44 + safe, 0.5, `${bar.h}px, inset ${safe}px`);
        checks.equal("it sits on the bottom edge", Math.round(bar.bottom), bar.ih);
        checks.ok(
          "its icon-only tabs are named and 44px tall",
          bar.tabs.every((t) => t.label && t.h >= 44),
          bar.tabs.map((t) => `${t.label} ${t.h}px`).join(", "),
        );

        const row = await tapHomeRow(page, "Zuidplein");
        checks.ok("a touch on the seeded trip reaches it", row.inside, `${row.visible}px of the row on screen`);
        await page.waitFor(`document.querySelectorAll('${OPTION}').length >= 3`, { label: "three travel options" });
        await sleep(900);
        const m = await page.eval(`
          const F = window.__fov;
          const col = document.querySelector('${COLUMN}');
          const map = document.querySelector('${MAP}');
          return { sheet: !!document.querySelector('${SHEET}'), col: col ? F.rect(col) : null,
                   map: map ? F.rect(map) : null };
        `);
        checks.ok("no results sheet on a phone on its side", !m.sheet, m.sheet ? "a sheet is mounted" : "none");
        checks.ok("the results column and the map are both there", m.col != null && m.map != null, `column ${!!m.col}, map ${!!m.map}`);
        if (m.col && m.map) {
          checks.atLeast(
            "they sit side by side",
            m.map.left - m.col.left,
            300,
            `column ${m.col.left}..${m.col.right}, map ${m.map.left}..${m.map.right}`,
          );
          checks.near("at the same height", m.map.top, m.col.top, 1, `column top ${m.col.top}, map top ${m.map.top}`);
        }
      } finally {
        await page.close();
      }
    },
  },
];
