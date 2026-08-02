# Fiets of OV — frontend

Rain-aware bike vs public-transport advice for Amsterdam. React + TypeScript + Vite,
routing by the `fiets-of-ov` backend (OpenTripPlanner underneath).

```bash
npm install
npm run dev          # http://localhost:5173
```

The app runs against offline fixtures by default (`VITE_API_MODE=mock`); set it to
`live` in `.env.local` to talk to a running backend.

## Checks before every change

One command runs everything CI runs — typecheck, lint and the whole test suite:

```bash
npm run check
```

The suite is fully offline (no network, no dev server needed) and finishes in a few
seconds, so there is no reason to skip it.

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

The map stack — leaflet, react-leaflet and the radar/wind layers — is code-split behind
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

## Night palette

The dark theme is *carbone virato navy*: still a discreet neutral dark, but its undertone
is the brand's own hue rather than a flat grey. Everything lives in the `night` block of
`tailwind.config.js`; nothing else in the app hard-codes a dark colour.

| token | value | what it is |
| --- | --- | --- |
| `night.shade` | `#171D21` | below the page — the map-label halo |
| `night.bg` | `#20282E` | page / `body` |
| `night.surface` | `#2A343A` | cards, pills, chips |
| `night.raised` | `#313B42` | menus, dropdowns, popovers |
| `night.hover` | `#3A454D` | hover on an opaque night surface |
| `night.border` | `#48545B` | borders and hairline dividers on one |
| `night.text` | `#ECEAE6` | primary text (the body ivory) |
| `night.muted` | `#D6D3CF` | secondary text |
| `night.subtle` | `#ABA79E` | tertiary / meta text |
| `night.faint` | `#807C72` | separator glyphs only |

**Why 204°.** Every surface step is `hsl(204, …)` — 204 is the hue of brand `#0D4A73`.
Saturation stays at 12–18%, low enough that the result reads as charcoal with a lean and
not as a blue theme, and `night.bg` was chosen so its WCAG relative luminance (0.0202)
matches the flat charcoal it replaced (`#23272B`, 0.0198): same perceived darkness, new
cast. The text steps are the mirror image — the body ivory is `hsl(40, …)`, so the
secondary tones are that same warm hue instead of the cool blue-grey slates that used to
fight it. Warm text on a cool surface is the theme's identity.

**Retuning** is one line per token. Move the hue on all six surface steps together, or
nudge one step's lightness. Two things have to follow:

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
colour from. And the basemap filter (`.dark .basemap-tiles`) is left alone — the CARTO
dark tiles measure at 0.8% mean saturation, so `hue-rotate`/`saturate` are near no-ops on
them; tinting the map would take an overlay, not a filter.

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

Because the map is only rendered on intent, a test that drives map events has to say so:
`src/test/mapReady.ts` exports `whenMapMounted()`, which dispatches the intent and waits
for the mount. Note that lazyMap's "already fetched" flag is module state and survives
between tests in the same file — assert the pre-intent state in the same test that calls
`whenMapMounted()`, not in a later one.

One thing worth knowing before adding tests: `useI18n` falls back to a working English
context with a **no-op** toggle when there is no `I18nProvider`, so a component rendered
bare will happily pass a language test that would fail in the real app. Anything that
touches language, theme or the header menu belongs in a test that mounts
`I18nProvider` — `App.flows.test.tsx` and `HeaderMenu.test.tsx` are the examples.
