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
