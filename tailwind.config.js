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
        // Night palette — the light theme's own blue, after dark. The surfaces sit on
        // brand #0D4A73 itself: `surface` IS the brand hex, verbatim, and the rest of
        // the ramp is solved around it on the same hue (204-205) at brand saturation,
        // so the dark page is recognisably the blue of the light theme's buttons and
        // titles — the ns.nl move: deep blue ground, white type, geel details.
        //
        // The text steps are the counterpart of the light theme's navy-on-white: pure
        // white body text, then blue-tinted whites on the surface hue. Each step
        // clears its WCAG floor on the *lightest* surface it is ever used on — `text`
        // reaches 12.77:1 on `bg` (AAA) and 7.51:1 on `hover`, `muted` 6.65:1 and
        // `subtle` 5.15:1 on `raised` (AA for body text), `faint` 3.44:1 on `surface`
        // (the non-text floor; it is only ever a separator glyph). Move a surface step
        // lighter and those two must be rechecked — theme.night.test.ts holds the line.
        //
        // Retuning: change the hue on all six surface steps together, or nudge one
        // step's lightness. Nothing else in the app hard-codes a dark surface.
        night: {
          shade: "#052033", // hsl(205 82% 11%) — below the page; the map-label halo
          bg: "#0A3552", // hsl(204 78% 18%) — page/body
          surface: "#0D4A73", // brand, verbatim — cards, pills, chips
          raised: "#164E74", // hsl(204 68% 27%) — menus, dropdowns, popovers
          hover: "#1E5980", // hsl(204 62% 31%) — hover on an opaque night surface
          border: "#3F7AA2", // hsl(204 44% 44%) — borders on an opaque night surface
          text: "#FFFFFF", // pure white — primary, the mirror of navy-on-white
          muted: "#CEE2F3", // hsl(207 60% 88%) — secondary (was slate-300)
          subtle: "#AFC9DE", // hsl(207 42% 78%) — tertiary/meta (was slate-400/500)
          faint: "#87A0B5", // hsl(207 24% 62%) — decorative separators only (was slate-500/600)
          // Dark accent — NS geel, used the way ns.nl uses it: details only. Icon and
          // link text, the small filled controls (filter pills, "Vai", badges — geel
          // ground, navy type, the signage pairing), the selected-card ring, the
          // slogan's accent line. Never a surface, never the backdrop. It holds
          // 4.87:1 as text on `hover` (the lightest surface it lands on) and 8.28:1
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
