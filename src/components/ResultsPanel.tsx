import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Mode } from "../api/types";
import { useI18n } from "../lib/i18n";
import { fade, listRow, overlay, staggered, useLeaving, useMotionPreset } from "../lib/motion";
import { departureLabel } from "../lib/planView";
import type { OptionView, PlanView } from "../lib/planView";
import { AdviceCard } from "./AdviceCard";
import { ItineraryDetails } from "./ItineraryDetails";

export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      view: PlanView;
      // The search these results answer. The rows arrive in sequence when it changes,
      // and only then: choosing another option or language re-renders the same rows,
      // and nothing arrives again.
      search: string;
      selectedMode: Mode;
      // Chooses an option. Absent while a ride is on: the route being ridden is the
      // chosen option's, so the rows show every option and choose none.
      onSelect?: (mode: Mode) => void;
    };

// A clock the panel can render from. Reading Date.now() during render makes the render
// impure and, worse, freezes it: the panel stays mounted for the whole session, so
// "Leave now" would keep insisting on a departure that left twenty minutes ago. Half a
// minute is finer than the label's own resolution and costs one re-render per tick.
const TICK_MS = 30_000;

function useNow(periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

// The weather's verdict on the trip: a tag, and the rain figure beside it when there is
// one. The advice banner leads with it, and the phone sheet's summary header carries it
// alone, so both say the same thing in the same words.
//
// The tag carries the state. Rain is the one that has to be seen, so it is a solid fill in
// both themes: amber with dark type by day, and at night geel with navy type, the signage
// pairing (10.92:1). Dry and unknown are quieter tags in their own hues, and at night they
// sit one step up the ramp on `raised`, where accent-soft and muted keep pinned floors.
// Nothing here is translucent accent: accent-deep behind text and geel/NN rims both
// composited to olive on the navy page.
export function WeatherVerdict({ view, className = "" }: { view: PlanView; className?: string }) {
  const { t } = useI18n();
  const wet = view.rainExpected === true;
  const unknown = view.rainExpected === null;
  const tagTone = wet
    ? "bg-amber-500 text-amber-950 dark:bg-night-accent dark:text-night-bg"
    : unknown
      ? "bg-gray-100 text-gray-600 dark:bg-night-raised dark:text-night-muted"
      : "bg-emerald-100 text-emerald-800 dark:bg-night-raised dark:text-night-accent-soft";
  const tag = wet ? t("rainExpected") : unknown ? t("forecastUnavailable") : t("dry");
  return (
    <div data-fov="weather-verdict" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${tagTone}`}>{tag}</span>
      {view.maxRain != null && view.maxRain > 0 && (
        <span className="text-xs font-medium text-slate-600 dark:text-night-muted">
          {t("upToMmH", { x: view.maxRain })}
        </span>
      )}
    </div>
  );
}

// `place` is the banner's place in the panel's arrival sequence: first over the
// options, after the last of them on a phone, where it reads under them.
function WeatherBanner({ view, place }: { view: PlanView; place: number }) {
  const { initial, animate } = useMotionPreset(staggered(overlay, place));
  // No box: the verdict, and the advice as a sentence under it. The rain card this
  // replaces sat in a column already holding the strip box and the option cards, which
  // made the results a box of boxes.
  return (
    <motion.div data-fov="weather-banner" className="px-3 py-2" initial={initial} animate={animate}>
      <WeatherVerdict view={view} />
      <p className="mt-1.5 text-sm font-medium text-slate-900 dark:text-night-text">{view.reason}</p>
    </motion.div>
  );
}

// The placeholder while a plan is on its way, and the one part of the panel that leaves
// with motion: a `fast` fade, over whatever replaces it. For those 150ms it is taken out
// of the flow (the panel is `relative`), so the results lay out in their final place
// from their first frame and nothing jumps when the skeleton goes; the panel's height is
// never animated. It is inert while it leaves, so a tap on a row that has just arrived
// reaches the row and not the grey box fading over it.
function Skeleton() {
  const { exit } = useMotionPreset(fade);
  const [leaving, leavingProps] = useLeaving();
  return (
    <motion.div
      data-fov="results-skeleton"
      className={`space-y-4 p-2 ${leaving ? "absolute inset-x-0 top-0" : ""}`}
      exit={exit}
      {...leavingProps}
    >
      <div className="h-20 animate-pulse rounded-card bg-gray-100 dark:bg-night-surface/70" />
      <div className="h-40 animate-pulse rounded-card bg-gray-100 dark:bg-night-surface/70" />
      <div className="h-56 animate-pulse rounded-card bg-gray-100 dark:bg-night-surface/70" />
    </motion.div>
  );
}

// One option row, arriving at its place in the sequence: 40ms after the row above it.
// It arrives when it mounts, which is when a new set of results does, so choosing
// another option (a re-render of the same row) replays nothing.
function OptionRow({
  place,
  selected,
  className,
  children,
}: {
  place: number;
  selected: boolean;
  className: string;
  children: ReactNode;
}) {
  const { initial, animate } = useMotionPreset(staggered(listRow, place));
  return (
    <motion.li
      data-fov="option"
      data-selected={selected ? "true" : "false"}
      className={className}
      initial={initial}
      animate={animate}
    >
      {children}
    </motion.li>
  );
}

// The chevron that carries a disclosure's state. Inline rather than a font glyph: the
// icon font is subset from the list in index.css and a new ligature there means
// regenerating the .woff2. The rotation is `motion-safe:`, but that prefix is a second
// guard: the global reduced-motion rule in index.css is what makes every transition
// in the app instant, prefixed or not.
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 motion-safe:transition-transform group-open/steps:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ResultsPanel({
  state,
  onStartNav,
  narrow = false,
}: {
  state: PanelState;
  // Starts turn-by-turn navigation for the selected option; the button only renders
  // when the app can actually navigate (a route exists), so the prop is optional.
  onStartNav?: () => void;
  // The phone tier: the results column is the bottom ~30% of the screen rather than
  // half the window, and two things move because of it. The advice banner goes under
  // the options instead of over them, and the chosen option's steps start folded. Both
  // are about what is on screen when the plan lands — see the comments where they are
  // used. App decides this on the same query that decides the rest of the phone layout.
  narrow?: boolean;
}) {
  return (
    // `relative` holds the leaving skeleton in place over what replaces it.
    <div className="relative">
      <AnimatePresence>{state.status === "loading" && <Skeleton key="skeleton" />}</AnimatePresence>
      <PanelBody state={state} onStartNav={onStartNav} narrow={narrow} />
    </div>
  );
}

// Everything but the skeleton. Each state arrives the way an overlay does, a fade and an
// 8px rise over `base`, and leaves at once: the skeleton's fade is the only exit in the
// panel, and a result that lingered would sit under the next one. Each is keyed, so a
// change of state mounts a new element and plays its arrival.
function PanelBody({
  state,
  onStartNav,
  narrow,
}: {
  state: PanelState;
  onStartNav?: () => void;
  narrow: boolean;
}) {
  const { t } = useI18n();
  const now = useNow(TICK_MS);
  const { initial, animate } = useMotionPreset(overlay);
  if (state.status === "loading") return null;
  if (state.status === "idle") {
    return (
      <motion.div
        key="idle"
        className="p-6 text-gray-500 dark:text-night-subtle"
        initial={initial}
        animate={animate}
      >
        {t("idlePrompt")}
      </motion.div>
    );
  }
  if (state.status === "error") {
    return (
      <motion.div
        key="error"
        className="m-2 rounded-card border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        initial={initial}
        animate={animate}
      >
        {state.message}
      </motion.div>
    );
  }

  const { view, search, selectedMode, onSelect } = state;
  const selected = view.options.find((o) => o.mode === selectedMode) ?? view.options[0];

  // All options can be filtered away by the mode chips; say so instead of crashing.
  if (!selected) {
    return (
      <motion.div
        key="none"
        className="m-2 rounded-card border border-gray-100 bg-white p-4 text-sm text-gray-500 dark:border-night-rim/20 dark:bg-night-surface dark:text-night-subtle"
        initial={initial}
        animate={animate}
      >
        {t("noOptionsMatch")}
      </motion.div>
    );
  }

  return (
    // Keyed on the search: a new set of results is a new block, and its rows arrive in
    // sequence. Anything else that re-renders it keeps the rows that are there.
    <div key={`ready:${search}`} className="space-y-3 p-2">
      {/* On anything wider than a phone the banner leads: there is room for the advice
          and the options at once. On a phone there is not — the strip and this banner
          were 219.5px of a 272px column, which left 52.9px of one option row visible
          when the plan landed and none of the other two. The banner is the sentence
          behind the "Best" badge the first row already carries, so on a phone it reads
          after the options rather than instead of them. Nothing is dropped. */}
      {!narrow && <WeatherBanner view={view} place={0} />}
      {/* The options, stacked. Each one is a full-width row, and the selected row and
          the itinerary it opens are one block rather than a card above a list
          somewhere below it: choosing an option and reading it are the same place.
          Nothing here scrolls sideways — the three 120px cards in an `overflow-x-auto`
          row that came before put the third one 64px past the clip on a 360px phone,
          where a tap at its centre reached the panel behind it.

          No card around any of them. The rows are a list with hairlines between them,
          and the chosen one is a flat tint with a 3px accent bar on its left edge. The
          bordered card with a 2px ring around the chosen row, holding a second bordered
          box for its itinerary, was a box in a box in a column of boxes. */}
      <ul data-fov="option-list" aria-label={t("travelOptions")}>
        {view.options.map((option, i) => {
          const isSelected = option.mode === selected.mode;
          const detailsId = `fov-option-${option.mode}`;
          // A hairline only between two plain rows: the tint already separates the
          // chosen block, and a line running into its rounded corner reads as a seam.
          // The line stays laid out, transparent, so every row is the same height
          // whichever one is chosen.
          const nextSelected = view.options[i + 1]?.mode === selected.mode;
          return (
            <OptionRow
              key={option.mode}
              place={i}
              selected={isSelected}
              // The chosen block's tint is light enough that every line of text on it
              // keeps AA (measured in browser-tests/specs/results.checks.mjs); the bar
              // is an inset shadow so it follows the corner radius without clipping
              // the row's focus outline.
              className={`border-b ${
                isSelected
                  ? "rounded-card border-transparent bg-brand-light/70 shadow-[inset_3px_0_0_theme(colors.brand.DEFAULT)] dark:bg-night-hover/60 dark:shadow-[inset_3px_0_0_theme(colors.night.accent)]"
                  : nextSelected
                    ? "border-transparent"
                    : "border-slate-200 dark:border-night-rim/20"
              }`}
            >
              <AdviceCard
                option={option}
                selected={isSelected}
                onSelect={onSelect ? () => onSelect(option.mode) : undefined}
                detailsId={detailsId}
              />
              {isSelected && (
                <SelectedDetails
                  id={detailsId}
                  option={option}
                  now={now}
                  narrow={narrow}
                  onStartNav={onStartNav}
                />
              )}
            </OptionRow>
          );
        })}
      </ul>
      {narrow && <WeatherBanner view={view} place={view.options.length} />}
    </div>
  );
}

/**
 * What the chosen option opens: when it leaves, how to start it, and the steps.
 *
 * On a phone the steps start folded. Open, they are 372px of an itinerary sitting
 * between option 1 and option 2, which is why comparing three options used to mean
 * scrolling 416px to reach the second one and 513px to reach the third. Folded, the
 * chosen option costs 66px instead of 372 and the list stays a list. This is still one
 * block with the row above it (same tint, a hairline between them, the disclosure
 * inside it), and on anything wider the panel is open, exactly as it was.
 */
function SelectedDetails({
  id,
  option,
  now,
  narrow,
  onStartNav,
}: {
  id: string;
  option: OptionView;
  now: number;
  narrow: boolean;
  onStartNav?: () => void;
}) {
  const { lang, t } = useI18n();
  const departure = departureLabel(option.itinerary, now, lang);
  const start = onStartNav ? (
    <button
      type="button"
      aria-label={t("startNavigation")}
      onClick={onStartNav}
      className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-brand px-4 text-xs font-semibold text-white transition hover:brightness-110 dark:bg-night-accent dark:text-night-bg"
    >
      {t("start")}
    </button>
  ) : null;
  return (
    <div
      id={id}
      data-fov="option-details"
      // One hairline between the row and its itinerary, and no box of its own: the
      // tint of the chosen block is the only surface either of them sits on.
      className="border-t border-slate-900/10 px-3 pb-3 pt-2.5 dark:border-night-rim/20"
    >
      {narrow ? (
        // A named group, not the bare `group` the estimates note uses: nested groups
        // both answer to `group-open:`, and the note's own chevron would turn when
        // this one opened. The 44px row is the departure line doing double duty — it
        // has to be on screen anyway, and a chevron beside it is what says the steps
        // are under it.
        <details className="disclosure group/steps" data-fov="option-steps">
          <summary
            data-fov="steps-toggle"
            className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
          >
            <Chevron />
            <span
              data-fov="departure"
              className="min-w-0 flex-1 truncate text-sm font-medium text-gray-600 dark:text-night-muted"
            >
              {departure}
            </span>
            <span className="shrink-0 text-xs font-semibold text-brand dark:text-night-accent">
              {t("stepByStep")}
            </span>
          </summary>
          {start && <div className="mt-2 flex">{start}</div>}
          {/* The summary above already names the steps; a second identical heading
              inside would be read out twice and drawn twice. */}
          <ItineraryDetails itinerary={option.itinerary} heading={false} />
        </details>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p
              data-fov="departure"
              className="min-w-0 flex-1 text-sm font-medium text-gray-600 dark:text-night-muted"
            >
              {departure}
            </p>
            {start}
          </div>
          <ItineraryDetails itinerary={option.itinerary} />
        </>
      )}
    </div>
  );
}
