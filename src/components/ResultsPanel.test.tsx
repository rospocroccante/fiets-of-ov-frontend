import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { ResultsPanel } from "./ResultsPanel";
import { buildPlanView } from "../lib/planView";
import { mockPlanFor } from "../api/mock";
import { glassClasses } from "../test/glass";

test("idle shows a prompt", () => {
  render(<ResultsPanel state={{ status: "idle" }} />);
  expect(screen.getByText(/enter origin and destination/i)).toBeInTheDocument();
});

test("error shows the message", () => {
  render(<ResultsPanel state={{ status: "error", message: "no bike route found for this trip" }} />);
  expect(screen.getByText("no bike route found for this trip")).toBeInTheDocument();
});

test("ready shows the weather reason, both options, and step-by-step", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  render(
    <ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect: () => {} }} />
  );
  // weather banner shows the recommendation reason
  expect(screen.getByText(/take tram/i)).toBeInTheDocument();
  // both option cards (recommended transit first)
  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings[0]).toHaveTextContent("Public transport");
  // step-by-step for the selected (transit) itinerary
  expect(screen.getByText(/Step by step/)).toBeInTheDocument();
  expect(screen.getByText("Metro 52")).toBeInTheDocument();
  // the selected option's departure line sits between the toggles and the steps
  expect(screen.getByText(/Leave (now|at)/)).toBeInTheDocument();
});

test("all options filtered away shows a friendly empty state", () => {
  const view = { ...buildPlanView(mockPlanFor("A", "Bijlmer rain")), options: [] };
  render(<ResultsPanel state={{ status: "ready", view, selectedMode: "bike", onSelect: () => {} }} />);
  expect(screen.getByText(/no options match/i)).toBeInTheDocument();
});

test("clicking an option calls onSelect", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  const onSelect = vi.fn();
  render(<ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect }} />);
  fireEvent.click(screen.getByText("By bike"));
  expect(onSelect).toHaveBeenCalledWith("bike");
});

test("the departure line keeps up with the clock instead of freezing at first render", () => {
  vi.useFakeTimers();
  try {
    const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
    const departure = view.options[0].itinerary.start_time;
    // Ten minutes before departure: the panel shows the clock time.
    vi.setSystemTime(departure - 10 * 60_000);
    render(
      <ResultsPanel state={{ status: "ready", view, selectedMode: "transit", onSelect: () => {} }} />,
    );
    expect(screen.getByText(/Leave at/)).toBeInTheDocument();

    // Nine minutes later the same mounted panel must say "leave now", untouched.
    act(() => vi.advanceTimersByTime(9 * 60_000));
    expect(screen.getByText("Leave now")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

// The shape the panel is built around: one list of options, and the itinerary living
// inside the option it belongs to. Geometry is measured in browser-tests/; what jsdom
// can prove is the containment, which is what "one continuous thing" means in the DOM.
function ready(selectedMode: "bike" | "transit" | "bike_and_ride" = "transit", onSelect = () => {}) {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  return { status: "ready" as const, view, selectedMode, onSelect };
}

function optionRows(): HTMLElement[] {
  return screen.getAllByRole("listitem").filter((li) => li.dataset.fov === "option");
}

test("the options are one named list, one row each", () => {
  render(<ResultsPanel state={ready()} />);
  const list = screen.getByRole("list", { name: "Travel options" });
  // Direct children only: an option row contains lists of its own (its four figures,
  // and the itinerary's steps once it is open).
  const rows = optionRows();
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.parentElement).toBe(list);
  expect(rows.map((r) => within(r).getByRole("heading", { level: 3 }).textContent)).toEqual([
    "Public transport",
    "By bike",
  ]);
});

test("the itinerary is drawn inside the chosen option, not beside the list", () => {
  render(<ResultsPanel state={ready("transit")} />);
  const [chosen, other] = optionRows();
  expect(chosen.dataset.selected).toBe("true");
  expect(within(chosen).getByText(/Step by step/)).toBeInTheDocument();
  expect(within(chosen).getByText("Metro 52")).toBeInTheDocument();
  // Not a second copy somewhere else in the panel, and nothing under the unchosen row.
  expect(screen.getAllByText(/Step by step/)).toHaveLength(1);
  expect(within(other).queryByText(/Step by step/)).not.toBeInTheDocument();
});

test("the chosen row's aria-controls resolves to the itinerary under it", () => {
  render(<ResultsPanel state={ready("transit")} />);
  const [chosen] = optionRows();
  const button = within(chosen).getByRole("button", { name: /public transport/i });
  const id = button.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  const panel = document.getElementById(id!);
  expect(panel).not.toBeNull();
  expect(chosen).toContainElement(panel);
  expect(within(panel!).getByText(/Step by step/)).toBeInTheDocument();
});

test("choosing another option moves the itinerary into that row", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<ResultsPanel state={ready("transit", onSelect)} />);
  fireEvent.click(screen.getByRole("heading", { name: "By bike" }));
  expect(onSelect).toHaveBeenCalledWith("bike");
  rerender(<ResultsPanel state={ready("bike", onSelect)} />);
  const rows = optionRows();
  const bikeRow = rows.find((r) => within(r).queryByRole("heading", { name: "By bike" }))!;
  const transitRow = rows.find((r) => within(r).queryByRole("heading", { name: "Public transport" }))!;
  expect(within(bikeRow).getByText(/Step by step/)).toBeInTheDocument();
  expect(within(transitRow).queryByText(/Step by step/)).not.toBeInTheDocument();
  expect(within(transitRow).getByRole("button")).toHaveAttribute("aria-expanded", "false");
});

test("onStartNav renders a Start button beside the departure line and fires on click", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  const onStartNav = vi.fn();
  render(
    <ResultsPanel
      state={{ status: "ready", view, selectedMode: "transit", onSelect: () => {} }}
      onStartNav={onStartNav}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
  expect(onStartNav).toHaveBeenCalledTimes(1);
});

// The phone tier. Two things move, and both are about what is on the screen when a plan
// lands in a results column that is the bottom third of the display rather than half
// the window. The geometry is measured in browser-tests/specs/results.checks.mjs; what
// jsdom can prove is the structure those measurements rest on.
describe("the phone tier", () => {
  function panel(onStartNav?: () => void) {
    return render(<ResultsPanel state={ready("transit")} narrow onStartNav={onStartNav} />);
  }

  test("the advice banner reads after the options instead of over them", () => {
    panel();
    const list = screen.getByRole("list", { name: "Travel options" });
    const banner = screen.getByText(/take tram/i).closest('[data-fov="weather-banner"]')!;
    expect(banner).toBeInTheDocument();
    // Same parent, banner second: it is still on the screen, under the rows.
    expect(banner.parentElement).toBe(list.parentElement);
    expect(list.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("the banner leads on anything wider", () => {
    render(<ResultsPanel state={ready("transit")} />);
    const list = screen.getByRole("list", { name: "Travel options" });
    const banner = screen.getByText(/take tram/i).closest('[data-fov="weather-banner"]')!;
    expect(list.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  test("the chosen option's steps start folded, inside the option's own block", () => {
    panel();
    const [chosen] = optionRows();
    const details = within(chosen).getByText(/Step by step/).closest("details")!;
    expect(details.open).toBe(false);
    // Folded, not gone: the steps are still this option's, in this option's block.
    expect(chosen).toContainElement(details);
    expect(within(details).getByText("Metro 52")).toBeInTheDocument();
    // And the row that opens them is the departure line, which has to be there anyway.
    const summary = details.querySelector("summary")!;
    expect(summary).toHaveTextContent(/Leave (now|at)/);
    expect(summary.className).toContain("min-h-[44px]");
  });

  test("the fold names the steps once, not twice", () => {
    panel();
    expect(screen.getAllByText(/Step by step/)).toHaveLength(1);
    // The itinerary's own header keeps the times either way.
    expect(screen.getByText(/\d\d:\d\d – \d\d:\d\d · \d+ min/)).toBeInTheDocument();
  });

  test("what the fold holds is the Start button and the steps, not a second panel", () => {
    const onStartNav = vi.fn();
    panel(onStartNav);
    const details = screen.getByText(/Step by step/).closest("details")!;
    const start = within(details).getByRole("button", { name: "Start navigation" });
    fireEvent.click(start);
    expect(onStartNav).toHaveBeenCalledTimes(1);
    // One itinerary, in there. Whether the browser paints it is the disclosure's job,
    // and that is measured for real in the browser layer.
    expect(document.querySelectorAll('[data-fov="itinerary"]')).toHaveLength(1);
    expect(details.querySelector('[data-fov="itinerary"]')).not.toBeNull();
  });
});

// The containers. The results column used to be a box of boxes: a bordered rain card,
// option cards with a 2px ring on the chosen one, and a second bordered box for its
// itinerary inside that. jsdom has no Tailwind, so what a unit test can hold is the
// class each surface is given; contrast and geometry are measured in browser-tests/.
describe("no box-in-box", () => {
  function plan(to: string, selectedMode: "bike" | "transit" | "bike_and_ride", narrow = false) {
    const view = buildPlanView(mockPlanFor("A", to));
    return render(
      <ResultsPanel
        state={{ status: "ready", view, selectedMode, onSelect: () => {} }}
        narrow={narrow}
        onStartNav={() => {}}
      />,
    );
  }

  test("nothing in the ready panel wears glass, on a phone or wider", () => {
    for (const narrow of [false, true]) {
      const { container, unmount } = plan("Zuid", "transit", narrow);
      // The Start button included: it is still a pill, but it no longer casts a shadow.
      expect(within(container).getByRole("button", { name: "Start navigation", hidden: true })).toBeInTheDocument();
      expect(glassClasses(container)).toEqual([]);
      unmount();
    }
  });

  test("the chosen option is a flat tint with an accent bar on its left edge and no ring", () => {
    plan("Zuid", "transit");
    const chosen = optionRows().find((r) => r.dataset.selected === "true")!;
    expect(chosen).toHaveClass("rounded-card", "bg-brand-light/70", "dark:bg-night-hover/60");
    expect(chosen).toHaveClass(
      "shadow-[inset_3px_0_0_theme(colors.brand.DEFAULT)]",
      "dark:shadow-[inset_3px_0_0_theme(colors.night.accent)]",
    );
    for (const row of optionRows()) {
      expect(row.className).not.toMatch(/\bring\b|ring-|border-brand|border-ams-ns/);
      expect(row).not.toHaveClass("bg-white", "dark:bg-night-surface");
    }
  });

  test("the rows are divided by hairlines, drawn only between two plain rows", () => {
    // Bike + transit, public transport, bike: the middle one chosen.
    plan("Zuid", "transit");
    const [before, chosen, after] = optionRows();
    expect(chosen.dataset.selected).toBe("true");
    // Every row keeps the same 1px line laid out, so no row changes height when
    // another is chosen; only its colour comes and goes.
    for (const row of [before, chosen, after]) expect(row).toHaveClass("border-b");
    // Not into the chosen block's rounded corner from above, nor under the block.
    expect(before).toHaveClass("border-transparent");
    expect(chosen).toHaveClass("border-transparent");
    expect(after).toHaveClass("border-slate-200", "dark:border-night-rim/20");
  });

  test("the itinerary is set off from its row by one hairline, with no box of its own", () => {
    plan("Zuid", "transit");
    const details = document.querySelector<HTMLElement>('[data-fov="option-details"]')!;
    expect(details).toHaveClass("border-t", "dark:border-night-rim/20");
    expect([...details.classList].filter((c) => /^(dark:)?(bg-|rounded|shadow|ring)/.test(c))).toEqual([]);
  });

  test("the advice banner is a tag and a sentence with no box", () => {
    plan("Bijlmer rain", "transit");
    const banner = document.querySelector<HTMLElement>('[data-fov="weather-banner"]')!;
    expect([...banner.classList].filter((c) => /^(dark:)?(bg-|border|rounded|shadow|ring)/.test(c))).toEqual([]);
    expect(within(banner).getByText(/take tram/i)).toHaveClass("text-sm", "font-medium", "text-slate-900", "dark:text-night-text");
  });

  // The tag carries the state, and none of the three may composite to olive at night:
  // no accent-deep fill behind text, no translucent geel rim.
  test.each([
    ["rain", "Bijlmer rain", "Rain expected", ["bg-amber-500", "text-amber-950", "dark:bg-night-accent", "dark:text-night-bg"]],
    ["dry", "Vondelpark", "Dry", ["bg-emerald-100", "text-emerald-800", "dark:bg-night-raised", "dark:text-night-accent-soft"]],
    ["unknown", "fog", "Forecast unavailable", ["bg-gray-100", "text-gray-600", "dark:bg-night-raised", "dark:text-night-muted"]],
  ])("the %s tag is a small solid tag in its own colours", (_, to, label, classes) => {
    plan(to, "bike");
    const banner = document.querySelector<HTMLElement>('[data-fov="weather-banner"]')!;
    const tag = within(banner).getByText(label);
    expect(tag).toHaveClass("rounded-md", "font-bold", ...classes);
    expect(tag).not.toHaveClass("rounded-full");
    expect(banner.outerHTML).not.toMatch(/accent-deep|night-accent\/\d+/);
  });
});
