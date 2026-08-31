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
        // Night palette v2 — "canale di notte": the canal blue taken to its near-black
        // end. The first ramp sat on saturated mid-navy (bg #0A3552, surface = brand
        // #0D4A73) and read as 2010-corporate; modern dark UIs (Radix steps 1-2,
        // Linear, CARTO Dark Matter) keep large areas near-black at low chroma and do
        // elevation with micro-steps of lightness plus hairline borders, saving
        // saturation for ONE accent. So: the hue stays canal blue (216-221, the light
        // theme after dark) but lightness collapses to L 4-14% on the surfaces and
        // saturation falls from 44% at the dark end to ~17% mid-ramp — blue as
        // temperature, not as colour. Geel remains the only vivid thing on screen.
        //
        // Each text step clears its WCAG floor on the *lightest* surface it is ever
        // used on — `text` 16.14:1 on `bg` (AAA) and 13.80:1 on `hover`, `muted`
        // 6.70:1 and `subtle` 4.94:1 on `raised` (AA for body text), `faint` 3.32:1
        // on `surface` (the non-text floor; it is only ever a separator glyph). Move
        // a surface step lighter and those must be rechecked — theme.night.test.ts
        // holds the line.
        //
        // Retuning: change the hue on all six surface steps together, or nudge one
        // step's lightness. Nothing else in the app hard-codes a dark surface.
        night: {
          shade: "#050810", // hsl(224 52% 4%) — below the page; the map-label halo
          bg: "#0A0F1A", // hsl(221 44% 7%) — page/body, near-black canal blue
          surface: "#101724", // hsl(219 38% 10%) — cards, pills, chips
          raised: "#131C2B", // hsl(218 39% 12%) — menus, dropdowns, popovers
          hover: "#16202F", // hsl(216 36% 14%) — hover on an opaque night surface
          border: "#2A3548", // hsl(218 26% 22%) — hairline; ≈ white @9% over `surface`
          text: "#E7ECF3", // off-white — never pure white on a near-black ground
          muted: "#96A3B8", // hsl(217 19% 65%) — secondary
          subtle: "#7C8BA1", // hsl(216 16% 56%) — tertiary/meta
          faint: "#5C6B82", // hsl(217 17% 44%) — decorative separators only
          // Dark accent — NS geel, used the way ns.nl uses it: details only. Icon and
          // link text, the small filled controls (filter pills, "Vai", badges — geel
          // ground, navy type, the signage pairing), the selected-card ring, the
          // slogan's accent line. Never a surface, never the backdrop. It holds
          // 10.63:1 as text on `hover` (the lightest surface it lands on) and 12.42:1
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
