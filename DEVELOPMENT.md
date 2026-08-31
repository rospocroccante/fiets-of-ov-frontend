# Fiets of OV frontend — development notes

The deep dives behind the short [README](README.md): configuration, CI, deployment,
the mobile contract, the basemap, the night palette and the test layout. The user-facing
guide is [GUIDE.md](GUIDE.md).

## Configuration

Two variables decide what the app talks to. Both are read at build time and baked into
the bundle, and both are documented in `.env.example`, which CI checks against the
source on every push so the two cannot drift apart.

`VITE_API_MODE` picks the data source. `mock` answers from the fixtures in
`src/api/mock.ts`, reaches no routing backend at all and shows a "mock" badge in the
corner. `live` calls the real backend.

`VITE_API_BASE` says where that backend is, and is ignored in mock mode. It takes one of
two shapes: `/api`, meaning the host serves the backend on the same origin through a
proxy, or an absolute `https://` URL, meaning the browser calls the backend directly and
the backend has to allow the site's origin with CORS. In development, `/api` is served
by the proxy in `vite.config.ts`, which forwards to `http://localhost:8008`
(`VITE_PROXY_TARGET` overrides the target). In production it is served by the Cloudflare
Pages Function described below.

`npm run dev` still starts with no `.env` present and falls back to mock, so a clone
with no setup runs offline.

### A build with nothing configured is refused

`vite build` produces no bundle unless `VITE_API_MODE` is named explicitly. This is the
deliberate answer to the alternative, which the app shipped until now: an unconfigured
build fell back to mock and served canned trips that look exactly like real answers, a
failure that surfaces in front of an audience rather than in a test run. In live mode
the build also checks `VITE_API_BASE`: it rejects a relative path that nothing in
production serves, and it rejects a plain `http://` backend, which a browser on an
HTTPS site blocks as mixed content. Point `/api` at such a backend instead and let the
proxy reach it server-side.

The guard is a small plugin at the top of `vite.config.ts` and it applies to builds
only, so `npm run dev` and the test suite keep their mock default. CI runs an
unconfigured build on every push and fails if that build succeeds.

## Checks before every change

One command runs everything CI runs — typecheck, lint and the whole test suite:

```bash
npm run check
```

The suite is fully offline (no network, no dev server needed) and finishes in a few
seconds, so there is no reason to skip it. It ends in a `vite build`, and that build
falls back to `VITE_API_MODE=mock` when nothing is set, so a fresh clone can commit
before it has a `.env`. The fallback is written into the `check` script alone, not into
the guard: `npm run build`, which is what CI and the deploy workflow run, still refuses
to produce a bundle nobody configured. Set `VITE_API_MODE` in the environment or in
`.env` and `check` builds that mode instead of the default.

### Pre-commit hook

`.githooks/pre-commit` runs `npm run check` before a commit is created. It is
versioned with the repo rather than hidden in `.git/hooks`, so enable it once per
clone:

```bash
git config core.hooksPath .githooks
```

A commit whose typecheck, lint or tests fail is refused. When you genuinely need to
land one anyway — a WIP commit on a branch, a rebase fixup — use
`git commit --no-verify`.

## Deployment

There are two targets. They cost different amounts and they fail in different ways, so
they are described separately.

### The offline demo, with no backend

Build in mock mode and upload `dist/` to any host that serves static files. Nothing
runs on a server, so nothing is billed, which is what the business model asks for until
a contract pays for infrastructure (see
`docs/superpowers/specs/2026-08-04-business-model-design.md`, section 3). Everything in
the app works except real routing: plans, stops, places, weather and radar all come from
fixtures.

```bash
VITE_API_MODE=mock npm run build
```

This is also what `.github/workflows/deploy.yml` builds by default, so a repository with
Cloudflare credentials and no other configuration publishes the demo.

### The live deployment, on Cloudflare Pages

A live build asks for `/api` on its own origin, and a static host has nothing behind
that path. `functions/api/[[path]].js` is what puts something there: a Cloudflare Pages
Function that forwards `/api/*` to the backend. Cloudflare routes the requests to it
from the file's path, so no routing table is needed. The backend URL lives on the Pages
project as the `BACKEND_ORIGIN` variable and never enters the bundle, which means the
backend needs no CORS configuration and may stay on plain HTTP behind Cloudflare. That
suits the free Oracle Cloud box running OpenTripPlanner.

That file is the one piece of production code TypeScript never sees, so CI compiles it
on every push with `wrangler pages functions build` and lints it with the rest — without
that, a syntax error in it would reach the deployed site with every other check green.

Set-up, once:

1. Create a Cloudflare API token with the "Cloudflare Pages: Edit" permission and note
   your account ID.
2. Add both to the repository as the secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`.
3. Add the repository variables `VITE_API_MODE=live` and `VITE_API_BASE=/api`.
4. On the Pages project, set the environment variable `BACKEND_ORIGIN` to the backend,
   for example `https://otp.example.org` or `http://203.0.113.10:8008`.

Every push to `main` then builds and deploys. The workflow creates the Pages project
named in `wrangler.toml` if it does not exist yet, so you never have to create the Pages
project by hand. Afterwards it requests `/api/__proxy` from the deployed site,
an endpoint the function answers on its own without calling the backend, and fails the
run when the answer does not come from the function. A proxy that the host never invokes
is indistinguishable from a working one when you only look at the repository, and that
check is what tells the two apart. In live mode it also fails when `BACKEND_ORIGIN` is
missing from the Pages project.

With no Cloudflare secrets present the deploy job is skipped and the run stays green, so
forks and fresh clones are not bothered by it.

### Somewhere other than Cloudflare Pages

Set `VITE_API_BASE` to the backend's absolute `https://` URL instead of `/api`. The
browser then calls the backend directly, which means the backend needs a certificate of
its own and has to send `Access-Control-Allow-Origin` for the site. Everything else is a
plain static upload. One caveat for GitHub Pages: a project site is served from
`/<repo>/`, and this build assumes it sits at the root of a domain, so use a user or
organisation site, or a custom domain.

### When a live request goes wrong

Requests to the backend have deadlines: 15 seconds for a plan, 8 for stops, 6 for the
Photon place lookup. A backend that stops answering therefore ends in an error the user
can read rather than a spinner that never stops. The three failures say different
things: "the routing service did not answer in time" for a timeout, "could not reach the
routing service" when the request never lands, and the backend's own message when it
answers with an error. Stops are an enrichment of a plan already on screen, so their
failures degrade to no stops and do not take the plan down.

## Mobile

This is a webapp before it is anything else, so the phone is the layout that has to be
right. Everything below is verified against a real headless Chromium driven over CDP —
`Emulation.setDeviceMetricsOverride` plus touch emulation, then `elementFromPoint` on
every interactive control and real `Input.dispatchTouchEvent` gestures.

**Viewports checked:** 390×844 (iPhone 12–15) and 360×800 (the common small Android) in
portrait, plus 844×390 landscape, each on home, mid-morph, the full map stage, with the
menu open and with the autocomplete open.

### Rules that are easy to break by accident

**Touch targets are 44×44.** Every control carries `min-h-[44px]` (and `min-w-[44px]`
where its width is not already there) rather than relying on padding, because padding
that looks generous at `text-sm` still measures 28–38px. Before this was enforced the
segmented Start/End/Radar buttons were 28px tall and the swap arrow was 22×24. If you
add a control, give it the minimum; `src/App.mobile.test.tsx` guards the ones on the
search pill and the home, `HeaderMenu.test.tsx` the menu rows.

**Inputs must not shrink below 16px on a touch device.** iOS Safari zooms the whole page
when a focused input's font-size is under 16px, and on this layout that throws the
floating search pill half off screen. `PlaceInput` handles it with
`[@media(pointer:coarse)]:text-base`. The condition is the *pointer*, not a width
breakpoint — an iPhone in landscape is 844px wide, past `sm`, and zooms just the same.

**Fixed chrome pays for `viewport-fit=cover`.** The viewport meta opts into painting
under the notch and the home indicator, so anything pinned to an edge has to add the
matching inset: the header, the home's language/theme pills, the map stage and the mock
badge all use `calc(<base> + env(safe-area-inset-*))`. A new fixed element without one
will sit under the status bar on a modern iPhone.

**The morph geometry is in `dvh`, not `vh`.** On a phone `100vh` is the *large* viewport
(URL bar collapsed) while `useMorphProgress` divides the scroll by the current
`window.innerHeight`. With `vh` the two disagree whenever the URL bar is showing: the
stage is taller than the screen, its bottom rows are unreachable (the scroll that would
reveal them is spent on the morph), and progress hits 1 before the second sentinel. The
container, the sticky stage, the scroll sentinel and the map pane all use `dvh`.

**The home stage scrolls its own content.** It is `absolute inset-0` inside an
`overflow-hidden` sticky box, and the page scroll drives the morph rather than the
content — so without `overflow-y-auto` anything past one viewport is unreachable for
good. At 390×844 that was the fourth popular trip (it started 5px below the fold) and
the whole of `HomeShortcuts`. Content that fits produces no scroller at all, so nothing
changes on a laptop.

**Only one stage is live at a time.** Both morph stages are mounted from the first paint
and differ only in opacity, so the off-screen one is marked `inert` (see `inertUnless` in
`App.tsx`): without it, Tab walks into invisible controls and a screen reader on the home
reads out the entire map UI. The `main` landmark moves with the visible stage.

### What the manifest covers

`public/manifest.webmanifest` makes the app installable: name, `start_url: "/"`,
`display: "standalone"`, theme and background colours, and a single hand-authored
`public/icon.svg` at `sizes: "any"`. Modern Chrome and Android accept an SVG icon, which
is why there is no binary in the repo. **iOS still wants a real PNG** for
`apple-touch-icon` (and ignores SVG manifest icons for the home-screen shortcut) — that
needs an actual rasterised file, so it is deliberately left undone rather than faked.
`index.html` carries the matching `theme-color` for light and dark via `media`.

### Loading

The map stack — leaflet, react-leaflet, MapLibre GL and the radar/wind layers — is code-split behind
`src/components/lazyMap.tsx` and is *not* rendered until the user shows a sign of heading
for the map (see `WARM_EVENTS` in `App.tsx`), which cut the home screen's cold load from
186 kB to 130 kB over the wire. Two things keep it that way:

- `React.lazy` alone is not enough. Both stages are mounted from the first paint, so a
  lazily-imported component that is always rendered fetches immediately. The `mapWanted`
  gate is what actually defers it; the same intent that opens the gate also calls
  `preloadMap()`, so the chunk lands before the morph finishes and the Suspense fallback
  never reaches the screen.
- `manualChunks` in `vite.config.ts` must stay in its function form, and React must keep
  its own named chunk. With the object form React ended up *inside* the leaflet chunk,
  the entry imported it back out, and `index.html` preloaded the whole 88 kB map stack on
  the home screen no matter what App did.
- MapLibre GL is the heaviest thing the map pulls, and it is reached only through a
  dynamic `import()` inside `Basemap`, like `leaflet-velocity` is from `WeatherLive`. It
  gets a chunk of its own that way, fetched when a map is actually drawn.

### Basemap

The map is drawn by MapLibre GL from OpenFreeMap vector tiles, hosted inside the Leaflet
map that owns every other layer (`src/components/Basemap.tsx`, `src/lib/basemapGL.ts`).
Daylight is the `bright` style; night is `/styles/night.json`, a snapshot of
OpenFreeMap's `fiord` recoloured onto the night ramp by `scripts/night-style.mjs` and
served from this origin — fiord as published is a paler grey-slate (ground `#45516E`)
that floated on the navy UI, so the ground is re-solved onto the ramp's own hue,
saturation and lightness (land next to `surface`) and water is pinned pale on
`night.muted`, light rivers and lakes cutting through the navy ground. Tiles,
glyphs and sprites still come from tiles.openfreemap.org; only the style document is
ours. Switching theme calls `setStyle` on the map already on the screen, so the canvas,
the camera and the radar frames above it all survive the swap.

Daylight is `bright` rather than `liberty` because it is the closest OpenFreeMap style to
the CARTO voyager raster the map used to draw, measured over Amsterdam at two zooms and
two screen sizes: share-weighted CIEDE2000 of 3.8 against liberty's 5.6, almost all of it
in the water, which liberty paints cornflower blue where voyager was a soft pale blue.
The note over `BASEMAP_STYLE` carries the numbers.

It replaces CARTO's raster basemaps, which are licensed to enterprise customers and grant
holders only (`docs/superpowers/specs/2026-08-15-third-party-terms.md`). OpenFreeMap asks
for a credit and nothing else, and that credit is in the About block and the privacy
notice rather than on the map: the GL layer is built with `attributionControl: false`
next to Leaflet's own, because MapLibre draws a credit in the corner of its canvas by
default.

Three things here are one character away from being wrong, and `browser-tests/specs/
basemap.checks.mjs` pins all three by reading pixels out of a screenshot (a WebGL canvas
has no DOM to measure): night has to be dark and day light, the radar frames have to
paint above the basemap (same tile pane, `z-index: 5` against the GL layer's `auto`), and
the theme switch has to restyle in place instead of rebuilding the layer. Two more
scenarios in the same file cover the ways the map fails quietly: one boots with
`getContext("webgl*")` stubbed to `null` and asserts the PDOK fallback below actually
renders, and one taps `+` until the zoom control disables, which is the only thing
pinning `maxZoom={19}` (Leaflet reads its ceiling off tile layers, and the GL basemap is
not one, so without it `getMaxZoom()` is `Infinity`).

That suite needs the network and a working GPU stack. It fetches real tiles from
`tiles.openfreemap.org` and, in the fallback scenario, from `service.pdok.nl`; offline it
fails at the wait for the basemap to paint. It also needs WebGL in the browser it drives,
which on a runner with no GPU means Chrome's `--enable-unsafe-swiftshader` (passed by
`browser-tests/lib/chrome.mjs` everywhere but macOS). Without it every GL scenario times
out after 30 s each, so the wait says "(WebGL unavailable in this browser)" rather than
leaving you to guess.

MapLibre GL is the largest thing in the build by a distance: `basemapGL-*.js` is
1,060.12 kB raw and 286.68 kB gzipped, against 144.78 kB / 44.96 kB for the entry chunk.
It is a deferred chunk, reached only through the dynamic `import()` in `Basemap`, so no
one pays for it until a map is drawn. `npm run check`, and `npm run build` with
`VITE_API_MODE` set, now print Rollup's "(!) Some chunks are larger than 500 kB after
minification" over it. That warning is expected and accepted: the chunk is already split
off and loaded on demand, which is the advice it gives.

`maplibre-gl.css` is not imported. Two of its rules matter for a map with no controls on
it and they live in `index.css`; the other 70 kB styles controls this map never creates.

A browser with no WebGL gets no vector map at all, so `Basemap` falls back to PDOK's BRT
Achtergrondkaart as plain raster tiles: `standaard` by day, `grijs` inverted by night
(`.dark .basemap-raster`). That is the Kadaster's own basemap, free and Netherlands-only.
It is a fallback, which means a working map rather than the designed one. PDOK is open
data with a credit obligation of its own, so it is named in the About block and in the
privacy notice next to OpenFreeMap, in both languages, and the privacy notice names
`service.pdok.nl` because that is the host the browser talks to on that path.

## Night palette

The dark theme is the light theme **mirrored**: deep navy canal-water surfaces with pure
white text — the exact inverse of the light theme's navy-on-white, not a dimmed copy of
it. Everything lives in the `night` block of `tailwind.config.js`; nothing else in the
app hard-codes a dark colour.

| token | value | what it is |
| --- | --- | --- |
| `night.shade` | `#052033` | below the page — the map-label halo |
| `night.bg` | `#0A3552` | page / `body` |
| `night.surface` | `#0D4A73` | cards, pills, chips — the brand blue, verbatim |
| `night.raised` | `#164E74` | menus, dropdowns, popovers |
| `night.hover` | `#1E5980` | hover on an opaque night surface |
| `night.border` | `#3F7AA2` | borders and hairline dividers on one |
| `night.text` | `#FFFFFF` | primary text — pure white |
| `night.muted` | `#CEE2F3` | secondary text |
| `night.subtle` | `#AFC9DE` | tertiary / meta text |
| `night.faint` | `#87A0B5` | separator glyphs only |
| `night.accent` | `#FFC917` | NS geel — detail text, small fills, rings |
| `night.accent-soft` | `#FFE38A` | lighter accent step — fine text on tinted chips |
| `night.accent-deep` | `#6B4E00` | translucent chip backgrounds and borders only |

**Why hue 204.** The surfaces are the light theme's own blue, after dark:
`night.surface` *is* brand `#0D4A73`, verbatim, and the rest of the ramp is solved
around it on the same hue at brand saturation — the ns.nl move of deep blue ground,
white type, geel details. Primary text on `night.bg` measures 12.77:1 — comfortably
past AAA.

**The accent is NS geel** (`#FFC917`, the same hex as `ams.ns`), used the way ns.nl
uses it: details, never surfaces. Icon and link text, the small filled controls
(filter pills, "Vai", badges — geel ground, navy type, the signage pairing), the
selected-card ring, and the headline accent line of the slogan. It holds 4.87:1 as
text on `hover`, the lightest surface it lands on, and 8.28:1 under `night.bg` text
when it is the fill. The primary Search action is the one deliberate exception: it
stays white (`from-white to-brand-light`, navy text) so the single biggest control
reads as light, not gold — and the home aurora is white mist only, no geel blob.
`theme.night.test.ts` pins the accent's contrast floors and fails any
`dark:*-emerald/lime/green-*` class a component reintroduces.

**Retuning** is one line per token. Move the hue on all surface steps together, or nudge
one step's lightness. Two things have to follow:

- `night.subtle` and `night.faint` are pinned to contrast floors, not to a look:
  `subtle` clears AA (4.5:1) on `raised`, the lightest surface it lands on, and `faint`
  clears the 3:1 non-text floor on `surface`. Lighten a surface and both need rechecking.
- `index.html`'s dark `theme-color` must equal `night.bg`, or the browser chrome shows a
  seam against the page on a phone.

`src/theme.night.test.ts` enforces both of those plus the ramp's ordering, and fails if
any component reintroduces a `dark:bg-[#hex]` or a `dark:*-slate-*` that the tokens
replaced.

**Two things that are deliberately *not* tokens.** `dark:border-white/10` and the
`dark:bg-white/10` frosted surfaces on the home stay white-alpha: they composite over the
animated aurora and over the basemap, where no fixed backdrop exists to derive a solid
colour from. And the basemap has no night token either: it carries a night style of its
own (see Basemap above), so the dark map is a restyle rather than a CSS filter over
daylight tiles.

**The dev server does not hot-reload `tailwind.config.js`.** After changing a token you
have to restart `npm run dev`; an already-open tab will keep serving the old values and
make a correct change look broken.

## Test layout

| File | What it guards |
| --- | --- |
| `src/App.flows.test.tsx` | The user-facing flows end to end, through the real provider tree: language and theme switches, search, re-search, planner errors, recents, saved places. |
| `src/App.test.tsx` | Map interaction: picking, dragging pins, the context menu, navigation. |
| `src/App.mobile.test.tsx` | The mobile contract: the map chunk stays out of the first render, the plan outcome is announced politely, touch targets keep their minimum size, the off-screen stage is inert. |
| `src/components/*.test.tsx` | One file per component. |
| `src/hooks/*.test.tsx`, `src/lib/*.test.ts` | Hooks and pure helpers. |

**Tests run in a random order**, files and tests within a file, on every run including
CI (`sequence.shuffle` in `vite.config.ts`). A suite that only passes in one order does
not pin what it claims to, and this one had drifted there: several map tests worked only
because an earlier test had already loaded the map chunk, and the test asserting the
map's *absence* worked only because it ran before any of them. Random order is what makes
that kind of coupling fail loudly instead of waiting for someone to reorder a file.

When it does fail, do not just rerun — the next run picks a different order. Every run
prints `Running tests with seed "N"`; `npx vitest run --sequence.seed=N` replays that
exact order, and `--sequence.shuffle=false` gives the old fixed order if you need it
while bisecting something else.

What keeps the order from mattering is `src/test/setup.ts`, which resets before every
test the three things that used to survive one: lazyMap's "the chunk is fetched" flag,
the react-leaflet mock's event-handler tables, and `localStorage` (plus the `dark` class
on the root element). Reset state at its source there rather than cleaning up inside the
tests that happen to notice — a test should not need to know what the one before it did.

Because the map is only rendered on intent, a test that drives map events has to say so:
`src/test/mapReady.ts` exports `whenMapMounted()`, which dispatches the intent and waits
for the mount. Every test that fires a map event calls it, including tests that follow
one which already did; the flag is cold again by then.

One thing worth knowing before adding tests: `useI18n` falls back to a working English
context with a **no-op** toggle when there is no `I18nProvider`, so a component rendered
bare will happily pass a language test that would fail in the real app. Anything that
touches language, theme or the header menu belongs in a test that mounts
`I18nProvider` — `App.flows.test.tsx` and `HeaderMenu.test.tsx` are the examples.
