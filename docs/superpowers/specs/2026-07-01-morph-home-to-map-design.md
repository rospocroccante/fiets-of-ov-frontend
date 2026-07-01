# Scroll-scrubbed morph: home <-> map — design

Date: 2026-07-01
Status: approved (design) — proceeding to plan + subagent execution
Repo: `fiets-of-ov-frontend`
Branch: `feat/morph-home-to-map` (stacked on `feat/gm-endpoint-picker`)

## Problem

The app switches hard between the landing (`HomeHero`) and the results/map view: `App`
renders `HomeHero` when `trip === null`, else a different tree. We want a continuous
transition where the shared containers resize and relocate from their landing layout to
their map layout, driven by scrolling down or by submitting a search.

## Goals (approved)

- One continuous morph from the home layout to the map layout. The search container is the
  shared element: it shrinks and moves from the big centered landing pill to the compact top
  bar of the map view. The headline and "Popular trips" fade/slide away; the map and results
  panel expand into place.
- **Scroll-scrubbed**: scrolling down advances the morph continuously; scrolling up reverses
  it. A **search submit** drives the same morph to completion; the **wordmark/Home** reverses
  it to the top.
- Reaching the map by scroll **without a search** shows an empty Amsterdam map where the user
  picks origin/destination with the existing tools (GPS, map click, draggable pins,
  autocomplete). The plan loads once both endpoints are set.
- Respect `prefers-reduced-motion`: fall back to an instant stage switch.

## Non-goals (YAGNI)

- No backend/schema change. No new routing behavior.
- No parallax of unrelated decoration; only the search container, headline, popular trips,
  map, and results panel participate.
- No horizontal or multi-stage scroll storytelling; a single 0->1 morph.

## Core model — one `progress` motion value (0..1)

A single motion value is the sole source of truth for the whole morph:

- **Scroll**: the app root is a tall scroll container (~`200vh`); the morphing UI lives in a
  `sticky top-0 h-screen` stage. Framer Motion `useScroll` over the container yields
  `scrollYProgress`; we map its first segment (scroll 0 -> ~1 viewport) to `progress` 0->1.
- **Search submit**: set the trip, then `window.scrollTo({ top: <scrub end>, behavior:
  "smooth" })` so `progress` animates to 1 through the same scroll path.
- **Home (wordmark)**: `scrollTo({ top: 0, behavior: "smooth" })` and clear the trip so
  `progress` returns to 0.
- **Reduced motion**: skip the scrub; `progress` is a plain state that jumps 0<->1 on
  search/home, and the scroll container collapses to a normal single-screen layout.

Everything reads `progress`; the two triggers just move the scroll position.

## Morph mapping (via `useTransform(progress, ...)`)

| Element | progress 0 (home) | progress 1 (map) |
| --- | --- | --- |
| Search container | large, centered, ~mid-screen, max-w-3xl pill | compact bar pinned top, full width, in the header |
| Wordmark | large, centered hero header | small, top-left |
| Headline + subtitle | visible | faded out + slid up (`opacity` 1->0, `y` 0->-40) |
| Popular trips | visible | faded out (`opacity` 1->0), then `pointer-events:none` |
| Map + MapPickToolbar | hidden/scaled 0.98, opacity 0 | visible, full right half, opacity 1 |
| Results panel + FilterBar | hidden (opacity 0) | visible left half |
| Now/Menu chrome | hidden | visible |

Interpolations are smooth (clamp at the ends). The map and panel become interactive only
near `progress >= ~0.9` (`pointer-events` gated) so mid-morph clicks don't misfire.

## Architecture

### `useMorphProgress` (new hook, `src/hooks/useMorphProgress.ts`)

Owns the motion value and the scroll wiring. Returns `{ progress, containerRef, toMap,
toHome, reduced }` where `progress` is a framer `MotionValue<number>`, `containerRef` attaches
to the scroll container, `toMap()`/`toHome()` smooth-scroll to the ends (or set state under
reduced motion), and `reduced` reflects `prefers-reduced-motion`. Internally uses `useScroll`
+ `useTransform`; under reduced motion it uses a `useMotionValue` toggled by `toMap`/`toHome`.

### `App` becomes the morph host

`App` no longer branches on `trip === null`. It always renders the scroll container + sticky
stage containing: the morphing wordmark, the shared search container (built from the existing
`EndpointField`s + swap + submit), the home sections (headline, popular trips) as
`motion.*` elements bound to `progress`, and the map+panel region. `useTripPlan(trip)` is
called with `trip` possibly null (already returns an idle view), so the map/panel render in an
idle state until both endpoints exist.

Endpoint state, the picker handlers (`selectEndpoint`, `locateEndpoint`, `onMovePoint`,
`onContextPick`, `swap`, `commitSearch`), and re-plan behaviour move onto the morph host
unchanged in spirit. `commitSearch`/popular-pick also call `toMap()`; the wordmark calls
`toHome()` and resets endpoints.

### Reused components

`EndpointField`, `MapView`, `MapPickToolbar`, `ResultsPanel`, `FilterBar` are reused as-is.
The standalone full-screen `HomeHero` is retired; its headline + popular-trips markup move
into the morph host as progress-bound sections (keep the copy and the `POPULAR` list). The
results `SearchBar` chrome is absorbed into the morphing search container.

### Map <-> scroll interplay

`MapView` gets `scrollWheelZoom` enabled only when `progress` is at 1 (fully open), so the
wheel scrubs the morph until the map is open, then zooms the map. Reverse is by scrolling up
in the scrub zone or clicking the wordmark (`toHome`). Pass a boolean `interactive` (derived
from progress===1) to `MapView` to gate `scrollWheelZoom`.

## Error handling / edge cases

- Reduced motion: no scroll scrubbing; instant stage swap; map view still fully functional.
- Submitting with only one endpoint: still morphs to the map (per "empty map + pick"), plan
  stays idle until both set — consistent with the map-first flow.
- Fast repeated scroll: `progress` is clamped [0,1]; interpolations clamp; no NaN.
- SSR/jsdom: `useScroll` and `window.scrollTo` are guarded; in tests (jsdom) the hook must not
  throw when layout APIs are absent.

## Testing

jsdom has no layout, so the morph is validated at runtime (Playwright), not in unit tests.

- Unit/component (vitest): `useMorphProgress` returns a usable API and does not throw in
  jsdom; `toMap`/`toHome` call `scrollTo` (mock it). App logic: submitting a search sets the
  trip and calls `toMap`; the wordmark calls `toHome` and clears endpoints; the home content
  (headline, "Popular trips") is present in the DOM at rest; the map/panel are present in the
  DOM (opacity is style-driven, so assert presence, not visibility). Existing tests updated to
  the new structure (the `HomeHero`-specific test is replaced by morph-host tests; `App.test`
  arm+click / drag / context-menu / swap flows keep working after the restructure).
- Runtime (Playwright, real Chrome): drive the actual morph — load the app, screenshot at
  scroll 0 (home), mid-scroll (~0.5), and full scroll (1, map); do a search from the home pill
  and confirm it morphs to the map with a plan; scroll back up / click wordmark to confirm the
  reverse. Screenshots are the evidence. Also verify `prefers-reduced-motion` path renders the
  map view without scrubbing.

## File structure

- Create: `src/hooks/useMorphProgress.ts` (+ `src/hooks/useMorphProgress.test.ts`).
- Modify: `src/App.tsx` (morph host), `src/components/MapView.tsx` (`interactive` prop for
  `scrollWheelZoom`), and tests (`src/App.test.tsx`, retire/replace
  `src/components/HomeHero.test.tsx`).
- Retire: `src/components/HomeHero.tsx` (content folded into the morph host) — remove the file
  and its test, or keep a thin re-export if simpler; the plan will specify.
- Reuse unchanged: `EndpointField`, `MapPickToolbar`, `ResultsPanel`, `FilterBar`, `SearchBar`
  fields.

## Risks / notes

- Scroll-jacking + an interactive Leaflet map is the main risk; gating `scrollWheelZoom` on
  progress===1 and keeping the panel side scrollable mitigates it. Tunable via the scrub-zone
  height.
- The exact transform curves (sizes, offsets, easing) need eyeball tuning; the plan sets
  sensible starting values and the runtime verify step tunes them from screenshots.
- Retiring `HomeHero` touches its tests; the morph host absorbs its responsibilities.
