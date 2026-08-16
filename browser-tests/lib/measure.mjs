// Page-side measurement helpers, as source strings.
//
// These run inside the browser, not here: `Page.eval` wraps whatever it is given in a
// function body and returns the value by JSON, so anything that touches the DOM has to
// be text on this side. Keeping them in one module means a spec asserts numbers instead
// of re-deriving how to get them, and that the way contrast is composited is written
// down once rather than approximated per scenario.

// Injected once per page, before any measurement. Everything hangs off `window.__fov`.
export const PROBE = `
window.__fov = {
  rect(e) {
    const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2),
             top: +r.top.toFixed(2), right: +r.right.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2) };
  },
  parse(s) {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  },
  over(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  },
  lum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  },
  hex(c) { return "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); },
  // What is actually painted behind an element: every ancestor background blended down
  // until an opaque one is reached. A translucent fill over a translucent fill over the
  // page is exactly how the night theme's surfaces are built, and reading only the
  // element's own background-color would score a transparent box against nothing.
  bgOf(el) {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = window.__fov.parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    stack.push({ r: 255, g: 255, b: 255, a: 1 });
    let out = stack[stack.length - 1];
    for (let i = stack.length - 2; i >= 0; i--) out = window.__fov.over(stack[i], out);
    return out;
  },
  // Composited contrast of an element's own text against that background, with the font
  // size, because 4.5:1 and 3:1 are different questions at different sizes.
  contrast(el) {
    const cs = getComputedStyle(el);
    const bg = window.__fov.bgOf(el);
    const fg = window.__fov.over(window.__fov.parse(cs.color), bg);
    const [hi, lo] = [window.__fov.lum(fg), window.__fov.lum(bg)].sort((a, b) => b - a);
    return { ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), fg: window.__fov.hex(fg),
             bg: window.__fov.hex(bg), px: parseFloat(cs.fontSize), weight: cs.fontWeight,
             text: (el.textContent || "").trim().slice(0, 24) };
  },
  // What a finger at (x, y) reaches, and whether that is inside \`sel\`.
  hit(x, y, sel) {
    const el = document.elementFromPoint(x, y);
    if (!el) return { inside: false, desc: "nothing (outside the viewport?)" };
    const desc = el.tagName +
      (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "");
    return { inside: sel ? !!el.closest(sel) : false, desc, text: (el.textContent || "").trim().slice(0, 30) };
  },
  // Bring a node into view inside whatever scroller holds it, then put the document's
  // own scroll back: moving that would drive the home/map morph and change the screen
  // the test is standing on.
  reveal(el) { const y0 = window.scrollY; el.scrollIntoView({ block: "center" }); window.scrollTo(0, y0); },
  // Is this element PAINTED, rather than merely in the document?
  //
  // Three separate things can be true of a node nobody can see: \`display: none\` (its
  // box is gone but the node is still there and still counts in querySelectorAll — this
  // is what hid the fare on the phone while every gate stayed green), a zero-width box,
  // and a box that something else is drawn over. So this asks for all three: a computed
  // display, real dimensions, and a hit test at the element's own centre resolving to
  // it or to something inside it. \`contains\` in that direction only: an ancestor would
  // match trivially, and at (0, 0) — where a display:none box reports itself — the
  // ancestor is \`html\`, which contains everything.
  //
  // \`checkVisibility\` covers the fourth: a closed <details> gives its content
  // \`content-visibility: hidden\`, which Chrome still lays out, so the rect of a node
  // inside one is real while nothing is on the screen.
  shown(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // The hit test goes at the centre of what is on the screen, not at the centre of
    // the box: a tall element scrolled half out of view has its geometric centre past
    // the fold, where elementFromPoint answers nothing and every element would look
    // hidden.
    const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth);
    const y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
    const onScreen = x1 > x0 && y1 > y0;
    const x = Math.round((x0 + x1) / 2), y = Math.round((y0 + y1) / 2);
    const at = onScreen ? document.elementFromPoint(x, y) : null;
    const rendered = typeof el.checkVisibility === "function"
      ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      : cs.display !== "none";
    return {
      display: cs.display, visibility: cs.visibility, opacity: Number(cs.opacity),
      w: +r.width.toFixed(2), h: +r.height.toFixed(2), x, y, rendered, onScreen,
      painted: rendered && r.width > 0 && r.height > 0 && onScreen && !!at && (at === el || el.contains(at)),
      hit: at ? at.tagName + (at.getAttribute && at.getAttribute("data-fov") ? "[" + at.getAttribute("data-fov") + "]" : "") : "nothing",
      text: (el.textContent || "").trim().slice(0, 24),
    };
  },
};
return true;
`;

// A trip with three options, planned the way a user plans one.
//
// The destination is what decides the fixture: api/mock.ts branches on the "to" string
// and only the one containing "zuid" answers with all three modes, which is the case
// every geometry question here is about. It arrives as a seeded recent trip so the
// route into the results is one tap on the home rather than four fields of typing.
export const TRIP_SEED = {
  "fov.recentTrips.v1": [
    {
      fromLabel: "Amsterdam Centraal",
      fromQuery: "Amsterdam Centraal",
      toLabel: "Zuidplein",
      toQuery: "Zuidplein",
      at: 1_700_000_000_000,
    },
  ],
};

export const OPTION = '[data-fov="option"]';
export const OPTION_BUTTON = '[data-fov="option-button"]';
export const OPTION_LIST = '[data-fov="option-list"]';
export const OPTION_DETAILS = '[data-fov="option-details"]';
export const OPTION_METRICS = '[data-fov="option-metrics"]';
// The chosen option's steps, folded on a phone and open everywhere else.
export const OPTION_STEPS = '[data-fov="option-steps"]';
export const STEPS_TOGGLE = '[data-fov="steps-toggle"]';
export const COLUMN = '[data-fov="results-column"]';
