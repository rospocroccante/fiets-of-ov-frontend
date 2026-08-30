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
  for (const name of [/^start$/i, /^end$/i, "Radar", /hide map/i]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
});

test("the folded tools still act on the map, and arming an endpoint closes the panel", () => {
  const armed: string[] = [];
  const toggles: string[] = [];
  renderPhoneBar({
    onArm: (w) => armed.push(w),
    onToggleRadar: () => toggles.push("radar"),
    onToggleMap: () => toggles.push("map"),
  });
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));

  // Radar and Hide map change something behind the panel, so it stays open and the flip
  // is visible.
  fireEvent.click(screen.getByRole("button", { name: "Radar" }));
  fireEvent.click(screen.getByRole("button", { name: /hide map/i }));
  expect(toggles).toEqual(["radar", "map"]);
  expect(screen.getByRole("button", { name: /^end$/i })).toBeInTheDocument();

  // Arming an endpoint is the opposite: the next tap belongs to the map, so the panel
  // gets out of the way and hands focus back to the control that opened it.
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  expect(armed).toEqual(["start"]);
  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
  expect(screen.getByRole("button", { name: /map options/i })).toHaveFocus();
});

test("Escape closes the map tools and hands focus back", () => {
  renderPhoneBar();
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  expect(screen.getByRole("button", { name: "Radar" })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "Escape" });

  expect(screen.queryByRole("button", { name: "Radar" })).toBeNull();
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
  for (const name of ["Bike", "Transit", "Bike + OV", /^start$/i, /^end$/i, "Radar", /hide map/i]) {
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
