import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Amsterdam palette. Brand is the deep canal-water navy; the accents are the
        // city's own colours: flag red (position), GVB blue (transit), fietsroute
        // green (bike), sky blue (weather), NS yellow (sun/highlight).
        brand: { DEFAULT: "#0D4A73", dark: "#0B2147", light: "#E7F0F7" },
        ams: {
          red: "#DA291C",
          gvb: "#0077C8",
          bike: "#059669",
          sky: "#0284C7",
          ns: "#FFC917",
        },
        // Night palette v3 — navy. v1 sat on saturated mid-navy (bg #0A3552, surface =
        // brand #0D4A73) and read as 2010-corporate; v2 went the other way, near-black
        // "canale di notte" (L 4-14%, chroma falling to ~17% mid-ramp), and the owner
        // rejected the mix — pale water and geel floated on a ground that read black,
        // not blue. v3 is the middle: a true navy ground (hue ~216, S 55-65%, L 6-20%
        // up the ladder) so the page reads *blue* at a glance; elevation is still
        // micro-steps of lightness plus hairline borders, and geel is still the only
        // non-blue vivid thing on screen.
        //
        // Each text step clears its WCAG floor on the *lightest* surface it is ever
        // used on — `text` 14.83:1 on `bg` (AAA) and 11.60:1 on `hover`, `muted`
        // 5.93:1 and `subtle` 5.00:1 on `raised` (AA for body text), `faint` 3.26:1
        // on `surface` (the non-text floor; it is only ever a separator glyph). Move
        // a surface step lighter and those must be rechecked — theme.night.test.ts
        // holds the line.
        //
        // Retuning: change the hue on all six surface steps together, or nudge one
        // step's lightness. Nothing else in the app hard-codes a dark surface.
        night: {
          shade: "#050B18", // hsl(221 66% 6%) — below the page; the map-label halo
          bg: "#0A192F", // hsl(216 65% 11%) — page/body, deep navy
          surface: "#0F2038", // hsl(215 58% 14%) — cards, pills, chips
          raised: "#132644", // hsl(217 56% 17%) — menus, dropdowns, popovers
          hover: "#172D4F", // hsl(216 55% 20%) — hover on an opaque night surface
          border: "#2E4568", // hsl(216 39% 29%) — hairline; a navy step, not a grey
          text: "#E7ECF3", // off-white — never pure white on a navy ground
          muted: "#96A3B8", // hsl(217 19% 65%) — secondary
          subtle: "#8496AD", // hsl(214 20% 60%) — tertiary/meta
          faint: "#60708A", // hsl(217 18% 46%) — decorative separators only
          // Dark accent — NS geel, used the way ns.nl uses it: details only. Icon and
          // link text, the small filled controls (filter pills, "Vai", badges — geel
          // ground, navy type, the signage pairing), the selected-card ring, the
          // slogan's accent line. Never a surface, never the backdrop. It holds
          // 8.93:1 as text on `hover` (the lightest surface it lands on) and 11.42:1
          // under `night.bg` text when it is the fill. `accent-soft` is fine text on
          // tinted chips; `accent-deep` never carries text — translucent tint only.
          // The one non-geel accent left is the primary Search action, which goes
          // shaded white (from-white to-brand-light) so the single biggest control
          // reads as light, not gold.
          accent: "#FFC917", // NS geel — detail text, small fills, rings
          "accent-soft": "#FFE38A", // lighter step — fine text on tinted chips
          "accent-deep": "#6B4E00", // translucent backgrounds/borders only
        },
      },
      borderRadius: { card: "1.25rem" },
    },
  },
  plugins: [
    // `mouse:` is (pointer: fine), the primary input being a mouse or a trackpad.
    //
    // It exists so a control can be shorter for a cursor than for a finger. 44px is the
    // finger's floor and this app holds to it, but it is a floor about fingertips, not
    // about legibility: a pointer lands on a 36px pill as reliably as on a 44px one, and
    // the 8px is 8px the map does not get. Everything gated on this must therefore be
    // decoration - size, padding, density - never whether a control exists or can be
    // reached, because a laptop with a touchscreen answers both queries and a mouse
    // plugged into a tablet changes the answer mid-session.
    //
    // Tailwind 3.4 has no pointer variants of its own; 4.x ships them under these names.
    plugin(({ addVariant }) => {
      addVariant("mouse", "@media (pointer: fine)");
      addVariant("finger", "@media (pointer: coarse)");
    }),
  ],
};
