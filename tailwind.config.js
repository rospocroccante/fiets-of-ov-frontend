/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
      },
      borderRadius: { card: "1.25rem" },
    },
  },
  plugins: [],
};
