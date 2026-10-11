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
        // Night palette v4, "Grachtenlicht". v1 sat on saturated mid-navy (bg #0A3552,
        // surface = brand #0D4A73) and read as 2010-corporate; v2 went near-black
        // ("canale di notte", L 4-14%) and read black rather than blue; v3 went back to
        // a true navy (hue ~216, S 55-65%, L 6-20%, bg #0A192F) and the owner called it
        // too sad. Three things made it sad. The home aurora at night was white mist
        // only, which on navy is grey fog. The frosted cards and pills were
        // `bg-white/10` inside a `border-white/10` rim, which on navy is grey glass.
        // And the rain advice card's amber-900/25 composited to mud brown.
        //
        // v4 keeps the navy and lifts it. The hue moves to ~210 (214 at `shade`, easing
        // to 207 at `border`), the upper steps gain lightness (`surface` L 14 to 17%,
        // `raised` 17 to 21%, `hover` 20 to 25%, `bg` only 11 to 12%), and the type
        // warms to ivory (`text` hsl(40 65% 95%)) against the cool ground. The colour
        // itself lives in the backdrop: the night aurora is teal and cobalt water with
        // warm lamp glows (NIGHT_BLOBS in HomeAurora.tsx), and the basemap
        // (public/styles/night.json) is rotated 6 degrees to follow the ramp. Glass is
        // tinted instead of white: translucent fills are night surfaces (`surface/60`,
        // `surface/70`, `hover/75` and up), and translucent hairlines and rings are
        // `rim`, a light blue, at 10-50%. Elevation is still small steps of lightness
        // plus hairlines, and geel is still the only vivid colour in the foreground.
        //
        // Each text step clears its WCAG floor on the lightest surface it is ever used
        // on: `text` 15.63:1 on `bg` (AAA) and 9.72:1 on `hover`, `muted` 7.64:1 and
        // `subtle` 6.37:1 on `raised` (AA for body text), `faint` 4.33:1 on `surface`
        // (it is only ever a separator glyph, so it answers to the 3:1 non-text floor).
        // Move a surface step lighter and those must be rechecked; theme.night.test.ts
        // holds the line, and also fails any `dark:` fill, border or ring that goes
        // back to translucent white.
        //
        // Retuning: change the hue on all six surface steps together, or nudge one
        // step's lightness. Nothing else in the app hard-codes a dark surface.
        night: {
          shade: "#050E1A", // hsl(214 68% 6%): below the page; the map-label halo
          bg: "#0C1E32", // hsl(212 61% 12%): page/body, deep navy
          surface: "#142B43", // hsl(211 54% 17%): cards, pills, chips
          raised: "#1B3650", // hsl(209 50% 21%): menus, dropdowns, popovers
          hover: "#21425E", // hsl(208 48% 25%): hover on an opaque night surface
          border: "#39607F", // hsl(207 38% 36%): opaque hairline, a navy step
          // The light-blue hairline for tinted glass. Only ever used translucent, for
          // borders and rings at 10-50%; never text, never a surface.
          rim: "#82B8ED", // hsl(210 75% 72%)
          text: "#FBF6EC", // hsl(40 65% 95%): warm ivory, never pure white on navy
          muted: "#BACED8", // hsl(200 28% 79%): secondary
          subtle: "#A8BDC7", // hsl(199 22% 72%): tertiary/meta
          faint: "#7890A1", // hsl(205 18% 55%): decorative separators only
          // Dark accent: NS geel, used the way ns.nl uses it, on details only. Icon and
          // link text, the small filled controls (filter pills, "Vai", badges, the rain
          // card's tag: geel ground, navy type, the signage pairing), the selected-card
          // ring, the rain card's rim, the slogan's accent line. Never a surface; in the
          // backdrop it is a single faint lamp glow in the night aurora (12% opacity).
          // It holds 6.79:1 as text on `hover` (the lightest surface it lands on) and
          // 10.92:1 under `night.bg` text when it is the fill.
          // `accent-soft` is fine text on tinted chips (9.83:1 on `raised`);
          // `accent-deep` never carries text, translucent tint only.
          // The one non-geel accent left is the primary Search action, which goes
          // shaded white (from-white to-brand-light) so the single biggest control
          // reads as light, not gold.
          accent: "#FFC917", // NS geel: detail text, small fills, rings
          "accent-soft": "#FFE38A", // lighter step: fine text on tinted chips
          "accent-deep": "#6B4E00", // translucent backgrounds/borders only
        },
      },
      // One radius for every surface that is still drawn as one: menus, popovers, the
      // map frame and the chosen results block. It was 1.25rem on everything, cards
      // inside cards included, and at 20px a stack of panels reads as a pile of
      // pills. Status tags take rounded-md and on/off controls stay pills.
      borderRadius: { card: "0.75rem" },
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
