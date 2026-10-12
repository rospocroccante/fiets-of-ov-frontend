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
portrait, plus 844×390 landscape, each on home, mid-morph, the full map stage, on the
tabs and the results sheet, and with the autocomplete open. The header menu, which a
phone no longer has, is checked at 768×1024 and on an 844×390 window with a mouse.

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
matching inset: the header, the map stage, the tab bar, the results sheet's content and
the mock badge all use `calc(<base> + env(safe-area-inset-*))`. A new fixed element without one
will sit under the status bar on a modern iPhone. The map stage on a portrait phone is the
one deliberate exception at the top: its map paints under the status bar, and the back
button and the chip row floating over it carry the inset instead.

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
reads out the entire map UI. The `main` landmark moves with the visible stage. Once the
home has faded out it is `visibility: hidden` as well. It sits over the map stage, and
Chrome's compositor counted its transparent layers as over the results sheet: a touch on
the sheet in the bands where the home has layers arrived uncancellable, and a full sheet
could not be pulled down from its content there.

### The phone shell: tabs, Back and the results sheet

On a phone (`isPhone` in `App.tsx`) the app has a tab bar with three tabs, Plan, Saved and
Profile, and the results of a plan open in a sheet over a full-screen map. The header
menu and the home's language and theme pills exist only on wider screens. On a phone
their contents are the Profile tab.

#### Layers

Everything that can cover something else has a place in one order. A new overlay takes a
slot from this table instead of a number of its own.

| Layer | z-index | Mounted in |
| --- | --- | --- |
| Map stage, home stage | `z-0`, `z-10` | the sticky morph box |
| Map overlays: chips, place card, navigation banner | `z-[1000]` | the map pane |
| Results sheet | `z-[1100]` | the map stage's `main`, portrait phone only |
| Floating chip row | `z-[1150]` | the map stage, portrait phone only |
| Filter popups | `z-[1150]`, `z-[1200]` | the filter bar |
| Saved and Profile screens | `z-[1400]` | `App`, outside both stages |
| Tab bar | `z-[1800]` | `App`, outside both stages |
| Mock badge on a phone | `z-[1850]` | `App`, outside both stages |
| Undo snackbar | `z-[1900]` | the Saved screen |
| Search screen, privacy notice | `z-[2000]` | `App`, outside both stages |
| Skip link | `z-[3000]` | the top of `App` |

The chip row shares the filter popups' z-index because the Map panel it opens has to
clear a full sheet. The round back button and the search pill float over the map from
outside the map stage, in the sticky morph box, so they paint over everything in it.

#### Tab bar

`TabBar` is mounted outside both morph stages: a tab screen makes both stages inert, and
the bar has to stay usable over it. It slides away on the map stage, where the sheet owns
the bottom edge, during navigation and under the search screen. It is 56px tall (44px and
icons only on a phone on its side) plus `env(safe-area-inset-bottom)`, and its top rule is
drawn inside it, so that is its whole height.

The home's scroller ends where the bar starts. Its box has a bottom margin of `TAB_BAR_PX`
or `TAB_BAR_COMPACT_PX` above the stage's own safe-area padding. Padding only the content
left the box running under the bar, and at 844×390 a touch on a popular trip half above
the bar's edge reached a tab. The margin is dropped during navigation, the one time the
bar is away while the home is on screen.

Saved and Profile (`TabScreen`) stay mounted while another tab is showing, hidden with
`visibility: hidden` and `inert`, so each keeps its scroll position. Tapping the tab that
is already active scrolls its screen to the top.

#### The Back button

`src/hooks/useAppNav.ts` mirrors the app's open layers and its active tab into history
entries. There is no router and the URL never changes. Opening a layer pushes an entry,
and so does going from Plan to Saved or Profile; Saved to Profile replaces it. A Back
press is a `popstate` the hook did not cause, and it closes the layers that the entry it
lands on does not have, through the `onBack` callback in `App.tsx`.

An in-app close (an X, the back arrow, a scroll from the map back to the home) updates
the UI at once and then consumes its own entry with a `history.back()` whose `popstate`
the hook ignores. A push asked for while that step is still travelling waits in a queue
until it lands. Every entry carries a session id from the page load that wrote it: after a
reload the hook replaces the current entry with a fresh base, and Back steps over entries
from the earlier load instead of reopening anything. Forward navigation is not supported,
and a forward step is undone.

The hook also sets `history.scrollRestoration` to `manual` while it is mounted. The
document's scroll is the morph, and with the browser's default every step back restored
the scroll position saved in the entry it landed on: closing the search screen to plan a
trip put the page back at the top, cancelled the smooth scroll to the map and left the
app on the home.

To add a layer, add its name to the `Layer` type, close it in the `onBack` callback in
`App.tsx`, and add one `useNavLayer(nav, "<layer>", isOpen)` line next to the others. The
order of those lines is the order of the stack when several layers open in one render.

#### The map stage on a portrait phone

On a portrait phone the map covers the whole map stage, edge to edge and under the status
bar, and its chrome floats over it the way Google Maps' does. The stage has no top padding,
and there is no header bar and no wordmark. Two rows sit under the top inset. The first,
8px down, holds the round back button (48px, `data-fov="map-back"`, the same `toHome` as
the arrow on the other layouts) and the search pill beside it, 48px tall. The second, 64px
down, is `FilterBar` with `floating` set: a row as wide as its chips, with no background, a
shadow and an opaque surface on each chip and "Map" last. When the chips do not fit, the row
scrolls sideways with no scrollbar drawn. Its layer (`data-fov="map-chrome"`) takes no
touches itself, so the map beside a short row still pans. At inset 0 the chips end at
108px; the map used to start at 200px, under a header, the pill on a row of its own and an
in-flow filter bar.

The pill is still the one element that flies from the home. On this layout its map end is
the first row: `searchY` ends at 8, and two custom properties read only by the portrait
class list, `--pill-shift` and `--pill-pad`, move its left edge 56px right and take its
padding from 6px to 1px once the home has faded. The shift is complete at progress 0.75,
before the pill reaches the back button's row. The two are custom properties because framer
leaves a motion value it was given on the element after the key is dropped from `style`: a
margin written directly stayed on the pill when the phone turned on its side, and cut 56px
off the left end of the landscape pill. While the map stage is up, the home's measurement of the
pill keeps its last value, so the slot in the home ignores the pill's map-end shape.

`MapView` has `topInset`, the twin of `bottomInset`. `App` measures it with a
`ResizeObserver` as the chip row's bottom relative to the map pane, plus 8px: 116px at
inset 0, and 0 in jsdom. Route fits and the reset pad the top by it (`paddingTopLeft:
[50, 50 + topInset]`). Leaflet's top corners start at it through `--fov-map-top`, which
`index.css` hands to `.leaflet-top`, and the radar readout, the armed-pick chip and the
far-from-route chip start 12px under it. The chip row keeps its box while navigation hides
it, so the number holds when a ride starts.

This layout has no + and - buttons. The map zooms by pinch, and Leaflet's keyboard zoom
still works. `zoomControl={false}` builds the map without them and also removes them from a
live map, since react-leaflet freezes the option at creation. The reset
(`data-fov="map-reset-view"`) moves out of the zoom column to a round button at the foot of
the bottom-right column, lifted by `bottomInset` above the sheet. A phone on its side and
every wider screen keep the + and - with the reset as a third button under them.

When navigation starts, the pill, the chips and the back button fade out and go inert, and
the banner takes the top at 8px under the inset. The back button hides with the others. The
banner spans the whole row, so a button left there would cover its maneuver glyph, and with
it gone the banner's Exit is the one control at the top of the screen. The system Back still
takes the rider to the home with navigation running, as the arrow did.

#### Results sheet

`ResultsSheet` has two parts: a header, which is all the collapsed sheet shows, and the
content under it. The header is `SheetSummary`. Once a plan is in, it shows the chosen
option (the recommended one until the rider picks another) with its mode, title, minutes
and Best tag, the weather verdict, a Start, and the other option's minutes as a 44px
button that selects it. The verdict is `WeatherVerdict` from `ResultsPanel.tsx`, the tag
and rain figure the advice banner leads with. The summary follows the chosen option
because Start navigates the chosen route. While a plan is on its way the header reads
"Planning your trip…" over a placeholder row that pulses only where motion is allowed.
When a plan fails it reads "Routes are unavailable right now. Try again in a moment."
with a Try again that bumps the submit nonce, so the same trip is fetched again. The
backend's message stays out of the sheet; the desktop results column still prints it.
With no trip there is no sheet. The content is the options, then the forecast strip and
the credits, and `App` renders it only when there are options to show. The chosen
option's steps in the content have no Start of their own, since the header carries one
at every height.

The detents are solved in `src/lib/sheetDetents.ts` from what the sheet measures with a
`ResizeObserver`. `detentHeights` takes the frame, the window height, the bottom inset,
the header (handle and summary) and the content's natural height. Peek is the header
above the bottom inset: 165px at 390x844 and 360x800 (a 1px border, the 44px handle and
a 120px summary), so the collapsed sheet shows the header whole and no slice of the
content. At peek the content is inert, `aria-hidden`, transparent and hidden, and it
fades in over the first 24px the sheet rises. Half is half the window height. Full is
the whole of the sheet's frame (`data-fov="sheet-frame"`), the part of the map stage
below `topInset`, or the end of the content if that comes first. A full sheet therefore
stops 8px or more under the chip row and leaves the pill and the chips on screen. The
frame takes no touches itself and clips what it holds. The place card lives in it on
this layout: a full sheet lifts the card by its own height, and the frame cuts it off at
the chrome where it would otherwise cover the pill. `MapView` clips its bottom-right
column at `topInset` the same way.

The sheet hugs its content. When the header and the content fit under half, that height
is its only resting place (`hugs()` is true): there is no handle, a tap on the header
does nothing, and a drag stretches the sheet against the rubber band and lets it come
back. A plan on its way or a failed one has no content, so its sheet is the header
alone. `data-hugs` marks this state on the sheet.

A new search lands at peek, with the map and the route as the screen, and navigation
drops the sheet to peek as well. A tap on the summary away from its buttons, or on the
handle, steps from peek to half, half to full and full back to peek. Full pushes the
`sheet-full` layer, so Back brings it down to half, and "Hide map" in the map tools
toggles between full and half on this layout; it is disabled while there is no sheet. A
release faster than `FLICK_PX_PER_S` (500px/s) moves one detent in its direction; a
slower one snaps to the nearest detent. Every settle runs on `SPRING.sheet` from
`src/lib/motion.ts`. A release hands the spring the finger's velocity, a settle that
interrupts another keeps the speed the sheet already has, and a move the app asks for
starts from rest. Reduced motion jumps (duration 0). The sheet carries 96px of its own
surface below its tallest detent, so an overshoot after a fast flick shows sheet and no
strip of map.

Touch goes through native listeners because of the hand-off. Below full every drag moves
the sheet. At full the content scrolls, and gives the drag back to the sheet only when it
is at `scrollTop` 0 and the finger moves down. The header, and the content below full,
are `touch-action: none`, and Chrome delivers the moves of such a touch with `cancelable`
false because nothing can scroll under them. The sheet takes those moves anyway. Only in
the content at full does an uncancellable move mean the browser is scrolling, and there
the sheet keeps out. That rule needs the faded home stage out of the way (see "Only one
stage is live at a time" above): while it was only transparent, touches on the sheet
arrived uncancellable in the bands where the home has layers.

The sheet reports its visible height when it settles (`onSettle`, never per frame), on
every path a settle can take, and `App` passes it as `bottomInset` to `MapView`, which
pads `fitBounds` and lifts its chip column by it, and to `PlaceInfoCard`. A phone on its
side has no sheet, since one would not fit in 390px of height: the results column and the
map stay side by side (`sheetLayout` is `isPhone && !landscapePhone`).

In the browser suite the plan lands collapsed, so a scenario that measures the options
opens the sheet to half first with `openSheetToHalf` from `browser-tests/lib/sheet.mjs`,
a touch on the handle followed by a wait for the spring to stop.

#### The phone in jsdom

jsdom answers false to every media query, so the unit suite renders the desktop layout
unless a test asks for a phone. `src/test/phone.ts` holds the helpers. `phoneViewport()`
makes the width query match, which is a portrait phone, and `phoneViewport({ landscape:
true })` makes the short-screen queries match instead. `stubHeights` gives the hero and
the pill real heights, and `morphTo(progress)` parks the morph. Call the function
`phoneViewport` returns after each test, or the next one inherits a phone.

A results sheet whose boxes all measure 0 hugs: it has one height and no handle. A test
that needs a phone's peek, half and full gives `stubHeights` the frame, the header and
the content, as `src/App.sheet.test.tsx` does with `{ "sheet-frame": 700, "sheet-head":
160, "sheet-body": 900 }`.

jsdom drops a Back pressed in the same task as one of the app's own history steps,
because its `pushState` cancels the traversal still pending. Tests let those steps land
first (`settle()` in `src/App.nav.test.tsx`). Chrome applies that same-task Back as well,
and it leaves the app; no finger and no hardware button can produce it, and
`browser-tests/specs/phone-nav.checks.mjs` covers the Back that a person can press.

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
that floated on the dark UI, so the ground is re-solved onto the ramp's own hue,
saturation and lightness (ground between `bg` and `surface`, a compressed
navy range) and water is pinned pale on `#AFD0E4` (hsl(202 49% 79%)), light rivers
and lakes cutting through the navy ground. Tiles,
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

The dark theme is v4, "Grachtenlicht": a lifted navy ramp at hue ~210 (214 at `shade`,
easing to 207 at `border`), warm ivory text, and the colour moved into the backdrop.
The night aurora is teal and cobalt water with warm lamp glows, the basemap is turned
onto the same hue, and glass is tinted with night surfaces and a light-blue `rim`
hairline instead of translucent white. v3 (navy, hue ~216, `bg #0A192F`) was called too
sad: its aurora was white mist, which on navy reads as grey fog, its frosted cards were
white glass, which reads grey, and the rain card's amber tint composited to mud brown.
Everything lives in the `night` block of `tailwind.config.js`; nothing else in the app
hard-codes a dark colour.

| token | value | what it is |
| --- | --- | --- |
| `night.shade` | `#050E1A` | below the page; the map-label halo |
| `night.bg` | `#0C1E32` | page / `body`, deep navy |
| `night.surface` | `#142B43` | cards, pills, chips |
| `night.raised` | `#1B3650` | menus, dropdowns, popovers |
| `night.hover` | `#21425E` | hover on an opaque night surface |
| `night.border` | `#39607F` | opaque hairline dividers, a navy step |
| `night.rim` | `#82B8ED` | light-blue hairline for tinted glass; translucent only (borders and rings at 10-50%), never text or a surface |
| `night.text` | `#FBF6EC` | primary text, warm ivory, never pure white |
| `night.muted` | `#BACED8` | secondary text |
| `night.subtle` | `#A8BDC7` | tertiary / meta text |
| `night.faint` | `#7890A1` | separator glyphs only |
| `night.accent` | `#FFC917` | NS geel: detail text, small fills, rings |
| `night.accent-soft` | `#FFE38A` | lighter accent step: fine text on tinted chips |
| `night.accent-deep` | `#6B4E00` | translucent chip backgrounds and borders only |

**Why hue ~210, lifted.** The surfaces are the light theme's blue after dark. v4 keeps
v3's navy and raises the upper steps (`surface` L 14 to 17%, `raised` 17 to 21%,
`hover` 20 to 25%, `bg` only 11 to 12%) so cards stand off the page, and it leaves the
vivid colour to the backdrop: the aurora and the pale water on the map. The first ramp
sat on saturated mid-navy (`bg #0A3552`, `surface` = brand `#0D4A73`) and read as dated;
those hexes live on in the light theme. v2's near-black "canale di notte" read black
rather than blue. Primary text measures 15.63:1 on `night.bg` (AAA) and 9.72:1 on
`hover`; `muted` 7.64:1 and `subtle` 6.37:1 on `raised`; `faint` 4.33:1 on `surface`.

**The accent is NS geel** (`#FFC917`, the same hex as `ams.ns`), used the way ns.nl
uses it: details, never surfaces. Icon and link text, the small filled controls
(filter pills, "Vai", badges, the rain card's tag: geel ground, navy type, the signage
pairing), the selected-card ring, and the headline accent line of the slogan. It holds
6.79:1 as text on `hover`, the lightest surface it lands on, and 10.92:1 under
`night.bg` text when it is the fill. The primary Search action is the one deliberate
exception: it stays white (`from-white to-brand-light`, navy text) so the single
biggest control reads as light, not gold. In the backdrop geel is one faint lamp glow
in the night aurora (12% opacity), next to an amber and an orange one.
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
replaced, or a translucent-white `dark:` fill, border or ring (`dark:bg-white/10`,
`dark:border-white/10`).

**Translucent, but tokens.** The frosted surfaces on the home and the overlays on the
map composite over the animated aurora and the basemap, where no fixed backdrop exists
to derive a solid colour from, so they stay translucent. Up to v3 they were white-alpha
(`dark:bg-white/10`, `dark:border-white/10`), which on navy reads as grey glass; v4
tints them with night tokens instead (`night-surface/60` and `/70`, `night-hover/75`
to `/95` on hover, `night-rim/10` to `/50` for hairlines and rings). The basemap has
no night token: it carries a night style of its own (see Basemap above), so the dark
map is a restyle rather than a CSS filter over daylight tiles.

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
