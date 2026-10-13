import { fireEvent, render, within } from "@testing-library/react";
import { SheetSummary } from "./SheetSummary";
import type { PanelState } from "./ResultsPanel";
import { buildPlanView } from "../lib/planView";
import { mockPlanFor } from "../api/mock";
import type { Mode } from "../api/types";

// The collapsed phone sheet shows this and nothing else, so it has to answer the trip on
// its own: which option, how long, whether it stays dry, and the two things a rider does
// next (go, or take the other option).
function ready(to: string, selectedMode: Mode, onSelect = vi.fn()): PanelState {
  return { status: "ready", view: buildPlanView(mockPlanFor("A", to)), search: "A to B", selectedMode, onSelect };
}

function summary() {
  return document.querySelector('[data-fov="sheet-summary"]') as HTMLElement;
}

test("ready: the chosen option with its minutes, the Best badge and the weather verdict", () => {
  // "Vondelpark" plans dry, bike first (24 min) and transit second (29 min).
  render(<SheetSummary state={ready("Vondelpark", "bike")} onStartNav={() => {}} onRetry={() => {}} />);
  const s = summary();
  expect(within(s).getByText("By bike")).toHaveAttribute("data-fov", "summary-title");
  expect(within(s).getByText("24 min")).toBeInTheDocument();
  expect(within(s).getByText("Best")).toBeInTheDocument();
  // The same tag the advice banner leads with, in the same words.
  expect(within(s).getByText("Dry")).toHaveClass("rounded-md", "font-bold");
  expect(s.querySelector('[data-fov="summary-mode"] svg')).not.toBeNull();
});

test("a wet trip carries the rain tag and its figure", () => {
  render(<SheetSummary state={ready("Bijlmer rain", "transit")} onStartNav={() => {}} onRetry={() => {}} />);
  const s = summary();
  expect(within(s).getByText("Rain expected")).toBeInTheDocument();
  expect(within(s).getByText("up to 1.2 mm/h")).toBeInTheDocument();
});

test("Start starts navigation, as the results panel's Start does", () => {
  const onStartNav = vi.fn();
  render(<SheetSummary state={ready("Vondelpark", "bike")} onStartNav={onStartNav} onRetry={() => {}} />);
  const start = within(summary()).getByRole("button", { name: "Start navigation" });
  expect(start).toHaveTextContent("Start");
  expect(start).toHaveClass("min-h-[44px]");
  fireEvent.click(start);
  expect(onStartNav).toHaveBeenCalledTimes(1);
});

test("while a ride is on it states the trip and offers nothing that would change it", () => {
  const onSelect = vi.fn();
  render(
    <SheetSummary state={ready("Vondelpark", "bike", onSelect)} onStartNav={() => {}} onRetry={() => {}} navigating />,
  );
  const s = summary();
  expect(within(s).getByText("By bike")).toHaveAttribute("data-fov", "summary-title");
  expect(within(s).getByText("24 min")).toBeInTheDocument();
  expect(within(s).getByText("Dry")).toBeInTheDocument();
  expect(within(s).queryAllByRole("button")).toHaveLength(0);
  expect(s.querySelector('[data-fov="summary-alt"]')).toBeNull();
  // A failed replan ends the ride (App); until it has, there is no Try again either.
  const { container } = render(
    <SheetSummary state={{ status: "error", message: "x" }} onRetry={() => {}} navigating />,
  );
  expect(within(container).queryAllByRole("button")).toHaveLength(0);
  expect(onSelect).not.toHaveBeenCalled();
});

test("with no route to navigate there is no Start", () => {
  render(<SheetSummary state={ready("Vondelpark", "bike")} onRetry={() => {}} />);
  expect(within(summary()).queryByRole("button", { name: "Start navigation" })).toBeNull();
});

test("the other option is a 44px button with its minutes, and choosing it selects it", () => {
  const onSelect = vi.fn();
  render(<SheetSummary state={ready("Vondelpark", "bike", onSelect)} onStartNav={() => {}} onRetry={() => {}} />);
  const alt = within(summary()).getByRole("button", { name: "Public transport, 29 min" });
  expect(alt).toHaveTextContent("29 min");
  expect(alt).toHaveClass("min-h-[44px]", "min-w-[44px]");
  fireEvent.click(alt);
  expect(onSelect).toHaveBeenCalledWith("transit");
});

test("once the other option is chosen, the summary is about it and offers the first one back", () => {
  render(<SheetSummary state={ready("Vondelpark", "transit")} onStartNav={() => {}} onRetry={() => {}} />);
  const s = summary();
  expect(within(s).getByText("Public transport")).toHaveAttribute("data-fov", "summary-title");
  expect(within(s).queryByText("Best")).toBeNull();
  expect(within(s).getByRole("button", { name: "By bike, 24 min" })).toBeInTheDocument();
});

test("a trip with one option has no other one to offer", () => {
  render(<SheetSummary state={ready("polder", "bike")} onStartNav={() => {}} onRetry={() => {}} />);
  expect(within(summary()).getAllByRole("button")).toHaveLength(1);
});

test("every option filtered away says so, with nothing to start", () => {
  const state = ready("Vondelpark", "bike");
  if (state.status !== "ready") throw new Error("unreachable");
  render(<SheetSummary state={{ ...state, view: { ...state.view, options: [] } }} onStartNav={() => {}} onRetry={() => {}} />);
  expect(within(summary()).getByText(/no options match/i)).toBeInTheDocument();
  expect(within(summary()).queryByRole("button")).toBeNull();
});

test("loading: a line that says so over a placeholder row that pulses only with motion allowed", () => {
  render(<SheetSummary state={{ status: "loading" }} onRetry={() => {}} />);
  const s = summary();
  expect(s).toHaveAttribute("aria-busy", "true");
  expect(within(s).getByText("Planning your trip…")).toBeInTheDocument();
  const row = s.querySelector('[data-fov="summary-placeholder"]') as HTMLElement;
  expect(row).toHaveAttribute("aria-hidden", "true");
  const bars = [...row.children];
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) {
    expect(bar).toHaveClass("motion-safe:animate-pulse");
    expect(bar).not.toHaveClass("animate-pulse");
  }
});

test("error: a sentence a person can act on, a Try again, and never the backend's string", () => {
  const onRetry = vi.fn();
  render(<SheetSummary state={{ status: "error", message: "routing upstream unavailable" }} onRetry={onRetry} />);
  const s = summary();
  expect(within(s).getByText("Routes are unavailable right now. Try again in a moment.")).toBeInTheDocument();
  expect(s.outerHTML).not.toMatch(/upstream/);
  const retry = within(s).getByRole("button", { name: "Try again" });
  expect(retry).toHaveClass("min-h-[44px]");
  fireEvent.click(retry);
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("idle has no summary at all", () => {
  const { container } = render(<SheetSummary state={{ status: "idle" }} onRetry={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test("no button in the summary is under 44px, in any state", () => {
  for (const state of [ready("Vondelpark", "bike"), { status: "error", message: "x" } as PanelState]) {
    const { unmount } = render(<SheetSummary state={state} onStartNav={() => {}} onRetry={() => {}} />);
    for (const b of within(summary()).getAllByRole("button")) expect(b).toHaveClass("min-h-[44px]");
    unmount();
  }
});
