import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { ResultsPanel } from "./ResultsPanel";
import { buildPlanView } from "../lib/planView";
import { mockPlanFor } from "../api/mock";

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
