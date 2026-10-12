import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "./FilterBar";
import type { KindFilter } from "./FilterBar";
import { I18nProvider } from "../lib/i18n";

const KINDS: KindFilter = { bike: true, transit: true, bike_and_ride: true };

function renderBar(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props: React.ComponentProps<typeof FilterBar> = {
    count: 2,
    hideMap: false,
    onToggleMap: () => {},
    armed: null,
    onArm: () => {},
    radar: false,
    onToggleRadar: () => {},
    kinds: KINDS,
    onToggleKind: () => {},
    ...overrides,
  };
  return render(<FilterBar {...props} />);
}

test("clicking Start requests arming the start endpoint", () => {
  const armed: string[] = [];
  renderBar({ onArm: (w) => armed.push(w) });
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  expect(armed).toEqual(["start"]);
});

test("the armed endpoint's button is pressed", () => {
  renderBar({ armed: "end" });
  expect(screen.getByRole("button", { name: /^end$/i })).toHaveAttribute("aria-pressed", "true");
});

test("Radar is a bar toggle; the Rain/Wind picker lives on the map, not in the bar", () => {
  const toggles: number[] = [];
  renderBar({ radar: true, onToggleRadar: () => toggles.push(1) });
  const radarBtn = screen.getByRole("button", { name: "Radar" });
  expect(radarBtn).toHaveAttribute("aria-pressed", "true");
  // Even with the radar active the bar gains no extra chips (no layout shift).
  expect(screen.queryByRole("button", { name: "Rain" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Wind" })).toBeNull();
  fireEvent.click(radarBtn);
  expect(toggles).toEqual([1]);
});

test("map-only controls (Set on map, Radar) are hidden when the map is hidden", () => {
  renderBar({ hideMap: true });
  expect(screen.queryByRole("button", { name: /^start$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
  expect(screen.getByRole("button", { name: /show map/i })).toBeInTheDocument();
});

test("one filter chip per option kind, including Bike + OV", () => {
  renderBar();
  expect(screen.getByRole("button", { name: "Bike" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Transit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bike + OV" })).toBeInTheDocument();
});

test("inside I18nProvider with Dutch preset the chips render in Dutch", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  try {
    render(
      <I18nProvider>
        <FilterBar
          count={2}
          hideMap={false}
          onToggleMap={() => {}}
          armed={null}
          onArm={() => {}}
          radar={false}
          onToggleRadar={() => {}}
          kinds={KINDS}
          onToggleKind={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Fiets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fiets + OV" })).toBeInTheDocument();
    expect(screen.getByText("2 routes in beeld")).toBeInTheDocument();
  } finally {
    // Shared jsdom storage: leave nothing behind for the English-default tests.
    window.localStorage.removeItem("fov.lang.v1");
  }
});

// --- The phone bar ------------------------------------------------------------------
//
// jsdom lays nothing out, so what these can honestly ask is which controls exist, what
// they are wired to, and where focus goes — the geometry (nothing off the clip, every
// target reachable at 320/360/390 in both languages, the cue painted only when the row
// really overflows) is measured in browser-tests/specs/map-chrome.checks.mjs.

function renderPhoneBar(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  return renderBar({ phone: true, ...overrides });
}

test("the phone bar keeps the mode filters and folds the map's tools behind one control", () => {
  renderPhoneBar();
  for (const name of ["Bike", "Transit", "Bike + OV"]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  // Nothing else is on the bar, which is the point: all seven controls together came to
  // 545px against 358px of screen.
  expect(screen.queryByRole("button", { name: /^start$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
  expect(screen.queryByRole("button", { name: /hide map/i })).toBeNull();

  const more = screen.getByRole("button", { name: /map options/i });
  expect(more).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(more);
  expect(more).toHaveAttribute("aria-expanded", "true");
  for (const name of [/^start$/i, /^end$/i, /hide map/i]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  // The radar is not one of them: on a phone it is a round button on the map itself
  // (RadarButton, placed by App), where it is seen without opening anything.
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
});

test("the phone's map tools hold no radar, whether it is on or off", () => {
  renderPhoneBar({ radar: true });
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  const panel = document.querySelector('[data-fov="filter-panel"]') as HTMLElement;
  expect(panel).not.toBeNull();
  expect(panel.textContent).not.toMatch(/radar/i);
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
});

test("the folded tools still act on the map, and arming an endpoint closes the panel", () => {
  const armed: string[] = [];
  const toggles: string[] = [];
  renderPhoneBar({
    onArm: (w) => armed.push(w),
    onToggleMap: () => toggles.push("map"),
  });
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));

  // Hide map changes something behind the panel, so it stays open and the flip is
  // visible.
  fireEvent.click(screen.getByRole("button", { name: /hide map/i }));
  expect(toggles).toEqual(["map"]);
  expect(screen.getByRole("button", { name: /^end$/i })).toBeInTheDocument();

  // Arming an endpoint is the opposite: the next tap belongs to the map, so the panel
  // gets out of the way and hands focus back to the control that opened it.
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  expect(armed).toEqual(["start"]);
  expect(screen.queryByRole("button", { name: /^end$/i })).toBeNull();
  expect(screen.getByRole("button", { name: /map options/i })).toHaveFocus();
});

test("Escape closes the map tools and hands focus back", () => {
  renderPhoneBar();
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  expect(screen.getByRole("button", { name: /hide map/i })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "Escape" });

  expect(screen.queryByRole("button", { name: /hide map/i })).toBeNull();
  expect(screen.getByRole("button", { name: /map options/i })).toHaveFocus();
});

test("the phone panel drops the map-only tools when the map is hidden", () => {
  renderPhoneBar({ hideMap: true });
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  expect(screen.queryByRole("button", { name: /^start$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
  expect(screen.getByRole("button", { name: /show map/i })).toBeInTheDocument();
});

test("the phone bar's controls are all 44px targets, panel included", () => {
  renderPhoneBar();
  const more = screen.getByRole("button", { name: /map options/i });
  expect(more).toHaveClass("min-h-[44px]", "min-w-[44px]");
  fireEvent.click(more);
  for (const name of ["Bike", "Transit", "Bike + OV", /^start$/i, /^end$/i, /hide map/i]) {
    expect(screen.getByRole("button", { name })).toHaveClass("min-h-[44px]");
  }
});

test("the Dutch phone bar names the trailing control so the spoken name contains the written one", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  try {
    render(
      <I18nProvider>
        <FilterBar
          count={2}
          hideMap={false}
          onToggleMap={() => {}}
          armed={null}
          onArm={() => {}}
          radar={false}
          onToggleRadar={() => {}}
          kinds={KINDS}
          onToggleKind={() => {}}
          phone
        />
      </I18nProvider>,
    );
    const more = screen.getByRole("button", { name: "Kaartopties" });
    // WCAG 2.5.3: what a voice-control user says has to be in the accessible name.
    expect(more.textContent).toContain("Kaart");
    expect(more.getAttribute("aria-label")).toContain(more.textContent!.trim());
  } finally {
    window.localStorage.removeItem("fov.lang.v1");
  }
});

test("Hide map is locked while navigating: the map pane is the nav UI", () => {
  const toggles: number[] = [];
  renderBar({ hideMapDisabled: true, onToggleMap: () => toggles.push(1) });
  const hide = screen.getByRole("button", { name: /hide map/i });
  expect(hide).toBeDisabled();
  fireEvent.click(hide);
  expect(toggles).toEqual([]);
});

test("the phone panel's Hide map is locked while navigating too", () => {
  renderPhoneBar({ hideMapDisabled: true });
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  expect(screen.getByRole("button", { name: /hide map/i })).toBeDisabled();
});

test("mode chips are real filters: pressed state reflects kinds, click toggles", () => {
  const toggled: string[] = [];
  renderBar({
    kinds: { bike: true, transit: false, bike_and_ride: true },
    onToggleKind: (m) => toggled.push(m),
  });
  expect(screen.getByRole("button", { name: "Bike" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Transit" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Transit" }));
  expect(toggled).toEqual(["transit"]);
});

test("floating over a full-bleed map, every chip carries its own shadow and the row no background", () => {
  // The portrait phone's map stage: the chips sit over the map in a row of their own,
  // like Google Maps' category chips. The row is as wide as its chips, so the map beside
  // them still takes a touch, and "Map" closes it.
  renderBar({ phone: true, floating: true });
  const bar = document.querySelector('[data-fov="filter-bar"]') as HTMLElement;
  expect(bar).toHaveClass("w-fit", "max-w-full", "pointer-events-auto");
  expect(bar.className).not.toMatch(/(^|\s)(bg-|py-|border)/);
  const buttons = [...bar.querySelectorAll("button")];
  expect(buttons[buttons.length - 1]).toHaveAttribute("data-fov", "filter-more");
  for (const b of buttons) {
    expect(b).toHaveClass("shadow-md", "min-h-[44px]");
  }
  // Unpressed chips get a surface of their own, opaque in both themes.
  const more = screen.getByRole("button", { name: /map options/i });
  expect(more).toHaveClass("bg-white", "dark:bg-night-surface");
  // The chips still scroll sideways when they do not fit, with no scrollbar drawn.
  const scroller = bar.querySelector('[data-fov="filter-scroller"]') as HTMLElement;
  expect(scroller).toHaveClass("overflow-x-auto", "[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden");
});

test("in flow the phone bar keeps its padding and its full-width row", () => {
  renderBar({ phone: true });
  const bar = document.querySelector('[data-fov="filter-bar"]') as HTMLElement;
  expect(bar).toHaveClass("py-3");
  expect(bar).not.toHaveClass("w-fit");
  for (const b of bar.querySelectorAll("button")) expect(b).not.toHaveClass("shadow-md");
});
