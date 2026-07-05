import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the two heaviest, rarely-changing stacks out of the app chunk so a
        // code change does not invalidate the whole bundle in users' caches.
        // leaflet-velocity stays out of the list: it is dynamically imported and
        // must keep its own lazy chunk.
        manualChunks: {
          leaflet: ["leaflet", "react-leaflet"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        // 8008, not 8000: the backend's `make run PORT=8008` convention on this
        // machine (8000 is held by an unrelated project whose FastAPI answers every
        // route with a bare "Not Found" — a confusing failure when the proxy points
        // there). VITE_PROXY_TARGET still overrides for other setups.
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8008",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      // Same-origin POI fetches in dev: this network has intermittently refused
      // connections to overpass-api.de from the browser, and a server-side hop
      // removes every browser variable (CORS, DNS, extensions). Prod builds skip
      // this path and hit the public mirrors directly (see usePois).
      "/overpass": {
        target: "https://overpass.openstreetmap.fr",
        changeOrigin: true,
        rewrite: () => "/api/interpreter",
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Stubbed globals (fetch, geolocation) are reset after every test so one file's
    // stubs can never leak into another.
    unstubGlobals: true,
    // Tests run fully offline against the mock data layer, regardless of any local
    // .env.local that points the dev server at the live backend.
    env: { VITE_API_MODE: "mock" },
    alias: {
      "react-leaflet": new URL("./src/__mocks__/react-leaflet.tsx", import.meta.url).pathname,
    },
  },
});
