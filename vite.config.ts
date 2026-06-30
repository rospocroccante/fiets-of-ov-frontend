import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Tests run fully offline against the mock data layer, regardless of any local
    // .env.local that points the dev server at the live backend.
    env: { VITE_API_MODE: "mock" },
    alias: {
      "react-leaflet": new URL("./src/__mocks__/react-leaflet.tsx", import.meta.url).pathname,
    },
  },
});
