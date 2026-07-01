# Home<->Map Morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard home/map view switch with one continuous, scroll-scrubbed morph
(also driven by search submit / Home), where the search container resizes and relocates from
the landing pill to the map top bar and the map + results panel expand into place.

**Architecture:** A single framer-motion `progress` MotionValue (0..1) is the source of truth;
scroll drives it, search/Home smooth-scroll to the ends. `App` becomes the morph host that
always renders a sticky stage with progress-bound sections, reusing the existing picker
components. `HomeHero` is retired.

**Tech Stack:** React 18 + TypeScript, framer-motion (installed), react-leaflet + Leaflet,
@tanstack/react-query, Vitest + Testing Library. Tests run offline in mock mode.

## Global Constraints

- One `progress` MotionValue (0..1) is the sole morph source of truth; scroll scrubs it,
  `toMap()`/`toHome()` smooth-scroll to the ends. Respect `prefers-reduced-motion` (instant
  stage swap, no scrubbing).
- Reaching the map without a search shows an empty Amsterdam map + the existing pickers; the
  plan is idle until both endpoints exist (`useTripPlan(null)` already returns idle).
- Reuse `EndpointField`, `MapView`, `MapPickToolbar`, `ResultsPanel`, `FilterBar`; retire the
  standalone `HomeHero` (fold its headline + `POPULAR` list into the morph host).
- No backend/schema change. No emoji, no AI/Claude trailer in commits or files. TDD; commit
  once per task.
- jsdom has no layout: unit tests assert LOGIC and DOM presence (not visual position). The
  visual morph is verified at runtime by the controller (Playwright) after the workflow.
- Commands (repo root `/Users/Rospo/Vibecoding/fiets-of-ov-frontend`): `npm test`,
  `npx tsc --noEmit`, `npm run lint`, `npm run build`.

---

### Task 1: `useMorphProgress` hook (`src/hooks/useMorphProgress.ts`)

**Files:**
- Create: `src/hooks/useMorphProgress.ts`
- Test: `src/hooks/useMorphProgress.test.ts`

**Produces:**
```ts
import { type MotionValue } from "framer-motion";
export interface MorphControls {
  progress: MotionValue<number>;   // 0 = home, 1 = map
  containerRef: React.RefObject<HTMLDivElement>;  // attach to the tall scroll container
  toMap: () => void;                // smooth-scroll to the scrub end (or set 1 under reduced motion)
  toHome: () => void;               // smooth-scroll to top (or set 0 under reduced motion)
  reduced: boolean;                 // prefers-reduced-motion
}
export function useMorphProgress(): MorphControls
```

**Behavior:**
- `reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false`
  (guard for jsdom where `matchMedia` may be undefined).
- Normal: `const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start
  start", "end start"] })`; expose `progress = scrollYProgress` (already 0..1 over the scrub).
  `toMap` = `window.scrollTo({ top: containerRef.current?.offsetHeight ?? 0, behavior:
  "smooth" })`; `toHome` = `window.scrollTo({ top: 0, behavior: "smooth" })`. Guard
  `window.scrollTo` existence.
- Reduced: `progress = useMotionValue(0)`; `toMap` sets it to 1, `toHome` to 0; `scrollTo`
  not required.
- MUST NOT throw in jsdom (no layout, `scrollTo`/`matchMedia` possibly missing).

**Tests (`useMorphProgress.test.ts`):** render the hook via a test component (or
`@testing-library/react` `renderHook`); assert it returns `progress`, `containerRef`,
`toMap`, `toHome`, `reduced` and does not throw; mock `window.scrollTo` and assert `toMap`
calls it with `behavior: "smooth"` and `toHome` with `top: 0`. (Under jsdom `reduced` may be
false; that path is fine.)

- [ ] Step 1: Write failing test.
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement the hook.
- [ ] Step 4: `npx vitest run src/hooks/useMorphProgress.test.ts` green; tsc clean.
- [ ] Step 5: Commit `feat: useMorphProgress scroll-scrubbed progress hook`.

---

### Task 2: `MapView` interactive gate (`src/components/MapView.tsx`)

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/components/MapView.test.tsx`

**Change:** add an optional prop `interactive?: boolean` (default `true` for back-compat).
Set the `MapContainer` `scrollWheelZoom={interactive}` (currently always on). When the morph
host later passes `interactive={progress===1}` the wheel scrubs the morph until the map is
fully open. Do not change any other behavior (pins, context menu, onPick, etc.).

**Tests:** existing MapView tests stay green; add one asserting the component renders with
`interactive={false}` without error (mock ignores the prop, so this is a smoke assertion — the
real effect is verified at runtime).

- [ ] Step 1: Add/adjust failing test.
- [ ] Step 2: Run, verify fail (or trivially pass if only a smoke add — still run).
- [ ] Step 3: Implement the prop.
- [ ] Step 4: `npx vitest run src/components/MapView.test.tsx` green; tsc clean.
- [ ] Step 5: Commit `feat: MapView interactive prop gates scrollWheelZoom`.

---

### Task 3: App morph host + retire HomeHero (`src/App.tsx`)

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/HomeHero.tsx`, `src/components/HomeHero.test.tsx`
- Modify: `src/App.test.tsx`

**Consumes:** Task 1 (`useMorphProgress`), Task 2 (`MapView interactive`), and the existing
`EndpointField`, `MapPickToolbar`, `ResultsPanel`, `FilterBar`, `SearchBar` fields,
`useTripPlan`, `reverseGeocode`, endpoint types from `./trip`.

**Behavior:** `App` stops branching on `trip === null`. It renders:

```
<div ref={containerRef} class="h-[200vh]">          // scroll container (scrub distance)
  <div class="sticky top-0 h-screen overflow-hidden"> // morphing stage
    <motion.header> wordmark (onClick=toHome) + Menu (chrome fades in with progress) </motion.header>
    <motion.section> headline + subtitle  (opacity 1->0, y 0->-40 as progress 0->1) </motion.section>
    <motion.div "search container">  From/To EndpointField + swap + submit
        (width/position/scale interpolate: centered pill -> top bar) </motion.div>
    <motion.section> Popular trips (opacity 1->0; pointer-events none past ~0.3) </motion.section>
    <motion.div "map region"> FilterBar + ResultsPanel + MapPickToolbar + MapView
        (opacity 0->1; pointer-events enabled past ~0.9; MapView interactive={progressIs1}) </motion.div>
  </div>
</div>
```

- Use `useTransform(progress, [0,1], [...])` for each animated style; import `motion`,
  `useTransform`, `useMotionValueEvent` from framer-motion. Track a boolean `progressIs1`
  (via `useMotionValueEvent(progress, "change", v => setProgressIs1(v > 0.99))`) to pass
  `interactive` to `MapView` and to toggle `pointer-events` on the map region.
- Reuse all endpoint handlers from the current App (selectEndpoint/locateEndpoint/
  onMovePoint/onContextPick/swap/commitSearch/startTrip semantics). `commitSearch` and the
  popular-trip pick set endpoints AND call `toMap()`. The wordmark calls `toHome()` and
  resets endpoints + `selectedMode`.
- The home headline copy and the `POPULAR` list come from the retired `HomeHero` (keep the
  same strings and the 4 popular trips). Under reduced motion the stage is a normal single
  screen (no 200vh spacer) and `toMap/toHome` jump progress; keep it functional.
- `useTripPlan(trip)` with `trip` derived from endpoints (null until both set) — idle map when
  empty; plan + route when set.
- Keep the `mock` badge behavior (`!isLive()`).

**Tests (`App.test.tsx`, replacing the HomeHero test):**
- Home content present at rest: headline text and "Popular trips" are in the DOM.
- Search flow: fill From + To, submit; `getPlan` is exercised (mock) and the recommended
  option renders (assert a plan detail appears, e.g. the reason text or a mode label). Mock
  `window.scrollTo` so `toMap` does not throw.
- Map pickers still work post-restructure: keep the existing arm-Start + `__fireMapClick`
  test (From field becomes the reverse-geocoded name); keep drag + context-menu + swap tests.
- Delete `HomeHero.test.tsx`.
- Mock `window.scrollTo` and (if needed) `window.matchMedia` in `src/test/setup.ts` or per
  test so jsdom does not throw.

- [ ] Step 1: Update/add failing tests (and delete HomeHero.test).
- [ ] Step 2: Run, verify fail.
- [ ] Step 3: Implement the morph host; delete HomeHero.tsx.
- [ ] Step 4: `npm test` green; `npx tsc --noEmit` clean; `npm run lint` exit 0;
  `npm run build` ok.
- [ ] Step 5: Commit `feat: continuous scroll-scrubbed morph between home and map`.

---

## Self-review checklist (author)

- Spec coverage: one progress source + scroll scrub (T1), map-interactivity gate (T2),
  morph host + reused components + retire HomeHero + reduced-motion + map-without-trip (T3).
- Type consistency: `MorphControls`, `MotionValue<number>`, `interactive?: boolean`,
  endpoint types from `./trip`, `which:"start"|"end"`.
- No placeholders: interfaces, layout skeleton, transform intents, and test cases are
  concrete. Exact transform curves are starting values; the controller tunes them at runtime.
- Known limitation stated: visual correctness is a runtime (Playwright) verification, not a
  unit test — called out in Global Constraints and Task 3 tests.
