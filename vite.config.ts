import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The path the bundled Cloudflare Pages Function answers on (functions/api/[[path]].js),
// and the same path the dev-server proxy below rewrites. A relative VITE_API_BASE is
// only honest if something actually serves it, so this is the only relative value the
// build accepts.
const PROXIED_BASE = "/api";

const HELP = `
  cp .env.example .env        # local development
  VITE_API_MODE=mock npm run build    # offline demo build, no backend
  VITE_API_MODE=live VITE_API_BASE=${PROXIED_BASE} npm run build    # deployed behind the proxy
`;

// A build with no configuration used to fall back to mock fixtures and ship them
// looking exactly like real answers, badge aside. Nothing downstream can tell the two
// apart, so the decision is forced here: name the mode or get no bundle. Build only -
// `npm run dev` and the test run keep their mock default.
function envGuard(): Plugin {
  return {
    name: "fov-env-guard",
    apply: "build",
    config(config, { mode }) {
      // envDir first, for the same reason Vite reads it there: whatever directory the
      // .env files are actually loaded from is the directory this has to check.
      const env = loadEnv(mode, config.envDir ?? config.root ?? process.cwd(), "VITE_");
      const apiMode = env.VITE_API_MODE;

      if (!apiMode) {
        throw new Error(
          `VITE_API_MODE is not set, so this build has no data source.\n` +
            `Set it to "mock" (offline fixtures) or "live" (real backend).\n${HELP}`,
        );
      }
      if (apiMode !== "mock" && apiMode !== "live") {
        throw new Error(`VITE_API_MODE must be "mock" or "live", not "${apiMode}".\n${HELP}`);
      }
      if (apiMode !== "live") return;

      const base = env.VITE_API_BASE;
      if (!base) {
        throw new Error(
          `VITE_API_MODE=live needs VITE_API_BASE to say where the backend is.\n` +
            `Use "${PROXIED_BASE}" when the host proxies it (Cloudflare Pages Function),\n` +
            `or an absolute https:// URL when the browser calls the backend directly.\n${HELP}`,
        );
      }
      if (base.endsWith("/")) {
        throw new Error(`VITE_API_BASE must not end with a slash: "${base}".`);
      }
      // https only, deliberately. A plain http:// backend is worse than a wrong one:
      // the site itself is served over HTTPS, so the browser blocks the request as
      // mixed content and every route fails at runtime with nothing in the build to
      // warn you. Reaching an http-only backend is what the /api proxy is for.
      if (base !== PROXIED_BASE && !/^https:\/\//.test(base)) {
        const isHttp = /^http:\/\//.test(base);
        throw new Error(
          (isHttp
            ? `VITE_API_BASE="${base}" is plain http, which a browser on an https site refuses\n` +
              `to call: the request is blocked as mixed content and no route ever loads.\n`
            : `VITE_API_BASE="${base}" is a relative path nothing serves in production.\n`) +
            `Only "${PROXIED_BASE}" is proxied (see functions/api/[[path]].js), and it is also\n` +
            `the way to reach a backend that has no certificate; anything else has to be an\n` +
            `absolute https:// URL to the backend.`,
        );
      }
    },
  };
}

// Regenerating the icon subset while the dev server is up used to leave the open tab
// rendering the literal ligature name: a giant LOCATION_ON across the map the first
// time, ZOOM_OUT_MAP the second. Nothing is wrong with the server, which serves the new
// bytes under Cache-Control: no-cache, and nothing is wrong with the font. It is the
// document: a FontFace the page has already loaded is never re-fetched, and HMR swapping
// in a component that uses a new glyph does not change that. Only a reload does, and
// there is no way for the page to know it needs one.
//
// So the file that cannot be hot-swapped asks for the reload itself. The production
// build has its own answer to this and does not need the plugin: the font is imported
// from src/, so Vite fingerprints it and a new subset is a new URL.
function reloadOnFontChange(): Plugin {
  return {
    name: "fov-reload-on-font-change",
    apply: "serve",
    handleHotUpdate({ file, server }) {
      if (!file.endsWith(".woff2")) return;
      server.ws.send({ type: "full-reload" });
      server.config.logger.info(`  the icon font changed, reloading the page: ${file}`);
    },
  };
}

export default defineConfig({
  plugins: [envGuard(), reloadOnFontChange(), react()],
  build: {
    rollupOptions: {
      output: {
        // Split the two heaviest, rarely-changing stacks out of the app chunk so a
        // code change does not invalidate the whole bundle in users' caches.
        // leaflet-velocity is deliberately unlisted: it is dynamically imported from
        // WeatherLive and must keep its own lazy chunk.
        //
        // The function form matters. With the object form (`{ leaflet: ["leaflet",
        // "react-leaflet"] }`) Rollup put react-leaflet's *dependencies* in that chunk
        // too, React among them - so the entry chunk had to `import {r} from
        // "./leaflet-<hash>.js"` to get React, index.html carried a modulepreload for
        // it, and the whole 88 kB stack was pulled down on the home screen no matter
        // how carefully App lazy-loaded MapView. Matching on the package directory
        // instead keeps the chunk to leaflet's own files and lets React stay where the
        // entry can reach it without dragging a map along.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Trailing slashes are load-bearing: "leaflet/" must not swallow
          // "leaflet-velocity/", which owns a lazy chunk of its own.
          if (/node_modules\/(leaflet|react-leaflet|@react-leaflet)\//.test(id)) {
            return "leaflet";
          }
          if (/node_modules\/framer-motion\//.test(id)) return "motion";
          // React needs a chunk of its own, and this is the line that actually makes
          // the map lazy. Left unassigned, React is a dependency of both the entry and
          // the (manual) leaflet chunk, and Rollup resolves that by parking React
          // *inside* leaflet - so the entry statically imported the whole map stack to
          // get React back. Naming it gives both chunks something neutral to import.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          return undefined;
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
    // Random order, files and tests alike, on every run including CI.
    //
    // The suite was order-dependent and nothing caught it: it passed in the fixed order
    // for months while several tests only worked because an earlier one had warmed the
    // map chunk, and one only worked because it ran before any that did. A green run in
    // a fixed order cannot tell "these tests pass" from "these tests pass in this
    // order", and the second is not what a test suite is for.
    //
    // The cost is real and worth naming: a failure here is not reproducible by rerunning
    // the command, because the next run picks a new order. It is reproducible by seed —
    // every run prints `Running tests with seed "N"`, and
    //   npx vitest run --sequence.seed=N
    // replays that exact order. `--sequence.shuffle=false` gives the old fixed order
    // when bisecting something unrelated.
    sequence: { shuffle: true },
    // Tests run fully offline against the mock data layer, regardless of any local
    // .env.local that points the dev server at the live backend.
    env: { VITE_API_MODE: "mock" },
    alias: {
      "react-leaflet": new URL("./src/__mocks__/react-leaflet.tsx", import.meta.url).pathname,
    },
  },
});
