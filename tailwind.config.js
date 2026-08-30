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
        // Night palette — "blu e bianco". The dark theme is the light theme inverted:
        // where light is white paper with canal-water navy on it, dark is canal-water
        // navy with white on it. Every surface sits on the brand hue (206-208, the hue
        // of brand #0D4A73) at real saturation (36-64%), so it reads as a *blue* theme,
        // not as charcoal with a lean. Lightness climbs the ramp; saturation eases off
        // as it does, the way the old ramp eased 18%→12%, so the border never goes neon.
        //
        // The text steps are the counterpart of the light theme's navy-on-white: pure
        // white body text, then blue-tinted whites on the same hue as the surfaces —
        // the cool mirror of the warm ivory ramp this replaces. Each step clears its
        // WCAG floor on the *lightest* surface it is ever used on — `text` reaches
        // 16.05:1 on `bg` (AAA) and 9.91:1 on `hover`, `muted` 9.14:1 and `subtle`
        // 6.03:1 on `raised` (AA for body text), `faint` 3.61:1 on `surface` (the
        // non-text floor; it is only ever a separator glyph). Move a surface step
        // lighter and those two must be rechecked — theme.night.test.ts holds the line.
        //
        // Retuning: change the hue on all six surface steps together, or nudge one
        // step's lightness. Nothing else in the app hard-codes a dark surface.
        night: {
          shade: "#081826", // hsl(208 64%  9%) — below the page; the map-label halo
          bg: "#0E2334", // hsl(207 58% 13%) — page/body
          surface: "#163046", // hsl(207 52% 18%) — cards, pills, chips
          raised: "#1C384F", // hsl(207 48% 21%) — menus, dropdowns, popovers
          hover: "#25465F", // hsl(206 44% 26%) — hover on an opaque night surface
          border: "#375B76", // hsl(206 36% 34%) — borders on an opaque night surface
          text: "#FFFFFF", // pure white — primary, the mirror of navy-on-white
          muted: "#CEE2F3", // hsl(207 60% 88%) — secondary (was slate-300)
          subtle: "#9FBAD1", // hsl(207 35% 72%) — tertiary/meta (was slate-400/500)
          faint: "#6A87A0", // hsl(207 22% 52%) — decorative separators only (was slate-500/600)
          // Dark accent — NS geel (the Dutch railway yellow, the ams.ns family),
          // replacing the emerald the dark theme used to borrow. `accent` works as
          // text on every surface (10.4:1 on `bg`, 6.4:1 on `hover`); solid fills
          // pair it with `night.bg` text — navy on yellow, the NS signage pairing.
          // `accent-soft` is the lighter text step on tinted chips; `accent-deep`
          // never carries text, it is the translucent chip/border tint only.
          accent: "#FFC917", // NS geel — accent text, fills, selection rings
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
