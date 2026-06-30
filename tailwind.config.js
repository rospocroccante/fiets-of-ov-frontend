/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#13386E", dark: "#0B2147", light: "#E8EEF7" },
      },
      borderRadius: { card: "1.25rem" },
    },
  },
  plugins: [],
};
