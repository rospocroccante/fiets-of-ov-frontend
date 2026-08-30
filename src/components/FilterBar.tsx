import { useEffect, useRef, useState } from "react";
import type { Mode } from "../api/types";
import { useI18n } from "../lib/i18n";
import type { StringKey } from "../lib/i18n";

type Armed = "start" | "end" | null;

export type KindFilter = Record<Mode, boolean>;

const KIND_KEY: Record<Mode, StringKey> = {
  bike: "bike",
  transit: "transit",
  bike_and_ride: "bikeAndRide",
};

export function FilterBar({
  count,
  hideMap,
  onToggleMap,
  armed,
  onArm,
  radar,
  onToggleRadar,
  kinds,
  onToggleKind,
  phone = false,
  compact = false,
}: {
  count: number;
  hideMap: boolean;
  onToggleMap: () => void;
  armed: Armed;
  onArm: (which: "start" | "end") => void;
  radar: boolean;
  onToggleRadar: () => void;
  kinds: KindFilter;
  onToggleKind: (m: Mode) => void;
  // The phone bar: the three mode chips stay on the bar and the map's own tools fold
  // behind one control, because all seven never fitted. See the comment on the phone
  // branch below for the measurements.
  phone?: boolean;
  // A phone on its side. Only the vertical padding changes: at 390px of height every
  // row above the map is a row the advice does not get.
  compact?: boolean;
}) {
  const { t } = useI18n();
  // Two button treatments, both with a constant box so toggling never resizes the bar:
  // standalone chips keep a border in every state (transparent when filled), segments
  // inside the map-tools group are borderless (the group carries the border).
  //
  // Both carry min-h-[44px]: at py-1.5/py-1 they measured 34px and 28px, and this bar is
  // the phone's main control surface (mode filters, map pickers, radar). 36px under
  // `mouse:` is the same row for a cursor, which does not need a fingertip's margin. The
  // bar measured 74px tall on a 1280x900 desktop, 170px of chrome above the map on a
  // 900px window; this and the padding below take it to 58px and hand the 16px to the
  // map. The finger's 44px is untouched, and the browser suite measures both pointer
  // types so that stays true.
  const chip = (pressed: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-3 text-sm font-medium transition mouse:min-h-[36px] sm:px-4 ${
      pressed
        ? "border-transparent bg-brand text-white dark:bg-emerald-600"
        : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-night-border dark:text-night-muted dark:hover:bg-night-hover"
    }`;
  const segment = (pressed: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full px-3 text-sm transition mouse:min-h-[36px] ${
      pressed
        ? "bg-brand text-white dark:bg-emerald-600"
        : "text-gray-600 hover:bg-gray-100 dark:text-night-muted dark:hover:bg-night-hover"
    }`;

  const pickBtn = (which: "start" | "end", label: string) => (
    <button
      type="button"
      onClick={() => onArm(which)}
      aria-pressed={armed === which}
      className={segment(armed === which)}
    >
      {label}
    </button>
  );

  // compact is the landscape phone, already down to py-1.5 and always a finger, so the
  // mouse step only applies to the standing case.
  const pad = compact ? "py-1.5" : "py-3 mouse:py-2";

  if (phone) {
    return (
      <PhoneFilterBar
        pad={pad}
        chip={chip}
        hideMap={hideMap}
        onToggleMap={onToggleMap}
        armed={armed}
        onArm={onArm}
        radar={radar}
        onToggleRadar={onToggleRadar}
        kinds={kinds}
        onToggleKind={onToggleKind}
      />
    );
  }

  return (
    // On narrow screens the bar scrolls sideways instead of wrapping, so its height
    // (and everything below it) never moves. Only reached above the phone breakpoint:
    // the phone gets PhoneFilterBar, where nothing is off screen to begin with.
    <div data-fov="filter-bar" className={`flex items-center justify-between gap-3 overflow-x-auto ${pad}`}>
      {/* Left cluster: the filters themselves — one chip per option kind — plus the
          live count. The count lives here so changes on the right never push it. */}
      <div className="flex shrink-0 items-center gap-2">
        {(Object.keys(KIND_KEY) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={kinds[m]}
            onClick={() => onToggleKind(m)}
            className={chip(kinds[m])}
          >
            {t(KIND_KEY[m])}
          </button>
        ))}
        <span className="hidden pl-1 text-sm text-gray-500 dark:text-night-subtle sm:inline">
          {t("routesInArea", { n: count })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Map tools in one segmented group: endpoints-on-map and the radar both act on
            the map, so they read as a single cluster and hide together with it. The
            group's content is fixed (the Rain/Wind picker lives on the map itself), so
            its width never changes. */}
        {!hideMap && (
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5 dark:border-night-border dark:bg-night-surface">
            <span className="hidden pl-2.5 pr-1 text-xs font-medium text-gray-500 dark:text-night-subtle sm:inline">
              {t("setOnMap")}
            </span>
            {pickBtn("start", t("start"))}
            {pickBtn("end", t("end"))}
            <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-night-border" />
            <button
              type="button"
              aria-pressed={radar}
              onClick={onToggleRadar}
              className={segment(radar)}
            >
              {t("radar")}
            </button>
          </div>
        )}
        {/* Fixed width: "Hide map" and "Show map" differ slightly, and a resizing
            button would nudge the whole right cluster on every toggle. */}
        <button
          onClick={onToggleMap}
          className="inline-flex min-h-[44px] min-w-[6.5rem] items-center justify-center rounded-full border border-gray-200 px-4 text-center text-sm mouse:min-h-[36px] dark:border-night-border dark:text-night-muted dark:hover:bg-night-hover"
        >
          {hideMap ? t("showMap") : t("hideMap")}
        </button>
      </div>
    </div>
  );
}

// The phone bar.
//
// What was here before: one horizontal scroller holding all seven controls. At 390x844
// it measured scrollWidth 545 against clientWidth 358 — 187px of it off screen, 198px in
// Dutch, 228px at 360 wide — with no fade, no scrollbar and not even a chip cut at the
// edge to say so (the "End" chip happened to end 3px before the clip). elementFromPoint
// at the centre of "Radar" and of "Hide map" returned nothing at every phone width: two
// controls that existed, answered every unit test, and could not be reached by a finger
// or discovered by eye.
//
// The shape now is Airbnb's filter row rather than a longer scroller: what stays on the
// bar is what the bar is for — the three mode filters — and the map's own tools fold
// behind one trailing control that is pinned and never scrolls away. The three chips
// measure 232px in English and 214px in Dutch against 275px of scroller at 390 and 245px
// at 360, so on both of those nothing is off screen at all.
//
// At 320 they do not fit (205px of scroller in English, 199 in Dutch), and that is the
// case the scroller is still `overflow-x: auto` for — along with anything else the
// measurements do not cover, a narrower device or a larger text size. When it happens
// the row shows both of the affordances Google Maps uses and the old bar had neither of:
// a chip visibly cut at the clip, and a fade over that edge. The fade is a static
// gradient rather than an animation, so there is nothing for prefers-reduced-motion to
// turn off.
function PhoneFilterBar({
  pad,
  chip,
  hideMap,
  onToggleMap,
  armed,
  onArm,
  radar,
  onToggleRadar,
  kinds,
  onToggleKind,
}: {
  pad: string;
  chip: (pressed: boolean) => string;
  hideMap: boolean;
  onToggleMap: () => void;
  armed: Armed;
  onArm: (which: "start" | "end") => void;
  radar: boolean;
  onToggleRadar: () => void;
  kinds: KindFilter;
  onToggleKind: (m: Mode) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether there is anything past each edge of the scroller, live. Two observers: the
  // scroller's own box changes when the phone turns, and the row of chips inside it
  // changes when the language does — a chip row that overflows only in Dutch is exactly
  // the case a one-off measurement misses.
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scrollerRef.current;
    const inner = contentRef.current;
    if (!el) return;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      setMore({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(read);
      ro.observe(el);
      if (inner) ro.observe(inner);
    }
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
    };
  }, []);

  // Escape closes the panel and hands focus back to the control that opened it, the
  // same contract the header menu keeps.
  const close = () => {
    setOpen(false);
    moreRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      moreRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div data-fov="filter-bar" className={`relative flex items-center gap-2 ${pad}`}>
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          data-fov="filter-scroller"
          className="flex items-center gap-2 overflow-x-auto"
        >
          <div ref={contentRef} className="flex items-center gap-2">
            {(Object.keys(KIND_KEY) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={kinds[m]}
                onClick={() => onToggleKind(m)}
                className={chip(kinds[m])}
              >
                {t(KIND_KEY[m])}
              </button>
            ))}
          </div>
        </div>
        {/* The two cues. `from-white`/`from-night-bg` is the map stage's own background
            on both themes, so the gradient reads as the row running out of room rather
            than as a shadow. Painted only when something really is past that edge. */}
        <span
          aria-hidden="true"
          data-fov="filter-cue-left"
          style={{ opacity: more.left ? 1 : 0 }}
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent dark:from-night-bg"
        />
        <span
          aria-hidden="true"
          data-fov="filter-cue-right"
          style={{ opacity: more.right ? 1 : 0 }}
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent dark:from-night-bg"
        />
      </div>

      {/* Pinned, never scrolled: this is the only way to the map's tools on a phone, so
          it has to be where the eye already is. Inline SVG rather than the icon font —
          that subset is frozen and has no chevron, and a missing glyph paints as the
          word "EXPAND_MORE" across the bar. */}
      <button
        ref={moreRef}
        type="button"
        data-fov="filter-more"
        aria-expanded={open}
        aria-label={t("mapToolsMenu")}
        onClick={() => setOpen((v) => !v)}
        // Open is NOT the chips' pressed treatment. A brand-filled pill on this row
        // means "this filter is on", and three of them are already saying that: a
        // fourth would read as a fourth filter rather than as an open menu. Open is a
        // raised surface and a darker label instead — the same step the night ramp uses
        // for a hovered opaque surface — plus the chevron, which turns over.
        //
        // `motion-safe:` on the transition, like every other transition in the app:
        // Tailwind's `transition` shorthand includes `transform`, and this control is
        // the one a rider taps to reach the map's tools.
        className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium motion-safe:transition ${
          open
            ? "border-gray-300 bg-gray-100 text-gray-800 dark:border-night-border dark:bg-night-hover dark:text-night-text"
            : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-night-border dark:text-night-muted dark:hover:bg-night-hover"
        }`}
      >
        {t("mapTools")}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {/* Above Leaflet's own chrome (z 800–1000) and above the picking hint, or the
              panel would open behind the map it belongs to. The scrim sits one step
              below it and one step above the map, so the first tap anywhere else closes
              the panel instead of landing on the map underneath. */}
          {/* As wide as its rows need and no wider. A fixed `w-60` (240px) is 83% of
              the 288px map pane on a 320px phone, and with the panel 163px tall inside
              a 256px map that came to 53.1% of the map behind the menu — over this
              file's own <=50% standard, at the one width the scenario did not visit.
              Content width instead: 186px in English, 215px in Dutch (the longest row
              is "Radar" beside "Verberg kaart"), which is 41.1% and 47.5% there and
              less on every wider phone. `max-content` also cannot wrap, so the panel
              can never buy width back by growing a row taller. The cap keeps the old
              240px as the ceiling and keeps the box on screen whatever a future string
              does — and if one ever pushes past it, the row wraps, the panel grows and
              the coverage assertion at 320 is what says so. */}
          <div
            data-fov="filter-panel"
            className="absolute right-0 top-full z-[1200] mt-1 w-max max-w-[min(15rem,calc(100vw-5rem))] rounded-card border border-gray-100 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-night-raised"
          >
            {!hideMap && (
              <>
                <p className="px-1 pb-2 text-xs font-medium text-gray-500 dark:text-night-subtle">
                  {t("setOnMap")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={armed === "start"}
                    onClick={() => {
                      onArm("start");
                      close();
                    }}
                    className={chip(armed === "start")}
                  >
                    {t("start")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={armed === "end"}
                    onClick={() => {
                      onArm("end");
                      close();
                    }}
                    className={chip(armed === "end")}
                  >
                    {t("end")}
                  </button>
                </div>
                <div className="my-3 h-px bg-gray-100 dark:bg-night-border" />
              </>
            )}
            {/* Radar and Hide map leave the panel open: both change something behind it,
                and the flip of the chip is the confirmation. Arming Start or End is the
                opposite — the next tap belongs to the map, so the panel gets out of the
                way first. */}
            <div className="flex flex-wrap gap-2">
              {!hideMap && (
                <button
                  type="button"
                  aria-pressed={radar}
                  onClick={onToggleRadar}
                  className={chip(radar)}
                >
                  {t("radar")}
                </button>
              )}
              <button type="button" onClick={onToggleMap} className={chip(false)}>
                {hideMap ? t("showMap") : t("hideMap")}
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("closeMapTools")}
            className="fixed inset-0 z-[1150] cursor-default"
            onClick={close}
          />
        </>
      )}
    </div>
  );
}
