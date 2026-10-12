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
        checks.near(
          "at full the sheet fills the space under the filter bar",
          full.top,
          full.main.top,
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
