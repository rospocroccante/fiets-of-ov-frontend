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
        // Night palette — "carbone virato navy". The dark theme stays a discreet
        // neutral dark, but its undertone is the brand's own hue instead of a flat
        // grey: every surface is hsl(204, …), 204 being the hue of brand #0D4A73.
        // Saturation is kept at 12-18% so the result reads as charcoal with a lean,
        // never as a blue theme. Lightness is the only axis that moves between steps,
        // and `bg` is set so its WCAG relative luminance (0.0202) matches the charcoal
        // it replaces (#23272B, 0.0198) — same perceived darkness, different cast.
        //
        // The text steps are the counterpart: the body ivory #ECEAE6 is hsl(40, …), so
        // the secondary tones are that same warm hue. Warm text on a cool surface is
        // the existing identity; the old blue-grey slates fought it. Their lightness
        // starts from the relative luminance of the slate step each one replaces, then
        // is raised to whatever clears its WCAG floor on the *lightest* surface it is
        // ever used on — `subtle` reaches 4.77:1 on `raised` (AA for body text),
        // `faint` reaches 3.06:1 on `surface` (the non-text floor; it is only ever a
        // separator glyph). Move a surface step lighter and those two must be rechecked.
        //
        // Retuning: change the hue on all six surface steps together, or nudge one
        // step's lightness. Nothing else in the app hard-codes a dark surface.
        night: {
          shade: "#171D21", // hsl(204 18% 11%) — below the page; the map-label halo
          bg: "#20282E", // hsl(204 18% 15%) — page/body
          surface: "#2A343A", // hsl(204 16% 20%) — cards, pills, chips
          raised: "#313B42", // hsl(204 15% 22%) — menus, dropdowns, popovers
          hover: "#3A454D", // hsl(204 14% 27%) — hover on an opaque night surface
          border: "#48545B", // hsl(204 12% 32%) — borders on an opaque night surface
          text: "#ECEAE6", // hsl(40 14% 91%) — primary, the body ivory
          muted: "#D6D3CF", // hsl(40  8% 83%) — secondary (was slate-300)
          subtle: "#ABA79E", // hsl(40  7% 65%) — tertiary/meta (was slate-400/500)
          faint: "#807C72", // hsl(40  6% 48%) — decorative separators only (was slate-500/600)
        },
      },
      borderRadius: { card: "1.25rem" },
    },
  },
  plugins: [],
};
