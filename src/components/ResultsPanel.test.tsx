import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { useReducedMotion } from "framer-motion";
import { ResultsPanel } from "./ResultsPanel";
import { buildPlanView } from "../lib/planView";
import { listRow, overlay, staggered } from "../lib/motion";
import { mockPlanFor } from "../api/mock";
import { glassClasses } from "../test/glass";
import { waitForExit } from "../test/exit";

// framer reads the system setting once per process, so the hook is mocked instead; the
// rest of framer is the real thing. `staggered` is the real one too, watched, so a
// test can ask which place in the sequence each row was given.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: vi.fn(() => false),
}));
vi.mock("../lib/motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/motion")>();
  return { ...actual, staggered: vi.fn(actual.staggered) };
});

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.mocked(staggered).mockClear();
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
    <ResultsPanel state={{ status: "ready", view, search: "A to B", selectedMode: "transit", onSelect: () => {} }} />
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
  render(<ResultsPanel state={{ status: "ready", view, search: "A to B", selectedMode: "bike", onSelect: () => {} }} />);
  expect(screen.getByText(/no options match/i)).toBeInTheDocument();
});

test("clicking an option calls onSelect", () => {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  const onSelect = vi.fn();
  render(<ResultsPanel state={{ status: "ready", view, search: "A to B", selectedMode: "transit", onSelect }} />);
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
      <ResultsPanel state={{ status: "ready", view, search: "A to B", selectedMode: "transit", onSelect: () => {} }} />,
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
function ready(
  selectedMode: "bike" | "transit" | "bike_and_ride" = "transit",
  onSelect = () => {},
  search = "A to Bijlmer",
) {
  const view = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  return { status: "ready" as const, view, search, selectedMode, onSelect };
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
      state={{ status: "ready", view, search: "A to B", selectedMode: "transit", onSelect: () => {} }}
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

  test("what the fold holds is the steps, not a second panel", () => {
    panel(() => {});
    const details = screen.getByText(/Step by step/).closest("details")!;
    // One itinerary, in there. Whether the browser paints it is the disclosure's job,
    // and that is measured for real in the browser layer.
    expect(document.querySelectorAll('[data-fov="itinerary"]')).toHaveLength(1);
    expect(details.querySelector('[data-fov="itinerary"]')).not.toBeNull();
  });

  // A phone on its side keeps the results column, so the Start is the panel's. It used
  // to be inside the fold, where a closed <details> lays it out and paints nothing: the
  // rider had no Start until they opened the steps.
  test("the Start stays out of the fold, in the chosen option's block", () => {
    const onStartNav = vi.fn();
    panel(onStartNav);
    const [chosen] = optionRows();
    const details = within(chosen).getByText(/Step by step/).closest("details")!;
    const start = within(chosen).getByRole("button", { name: "Start navigation" });
    expect(details).not.toContainElement(start);
    expect(start.closest('[data-fov="option-details"]')).toBe(details.closest('[data-fov="option-details"]'));
    fireEvent.click(start);
    expect(onStartNav).toHaveBeenCalledTimes(1);
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
        state={{ status: "ready", view, search: "A to B", selectedMode, onSelect: () => {} }}
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

// How the results arrive. setup.ts makes every framer animation finish at once, but not
// synchronously: an element is first rendered at its initial pose, and framer moves it
// to its target on its next frame. So straight after a render a row that has just
// arrived is still transparent and 6px low, while a row that was already on screen is
// at rest. That first frame is what these tests read.
describe("arrival", () => {
  const atRest = (el: HTMLElement) => el.style.opacity === "1" && el.style.transform === "none";

  test("a new set of results arrives row by row, each rising 6px into place", async () => {
    render(<ResultsPanel state={ready()} />);
    const rows = optionRows();
    for (const row of rows) {
      expect(row.style.opacity).toBe("0");
      expect(row.style.transform).toBe("translateY(6px)");
    }
    await waitFor(() => expect(rows.every(atRest)).toBe(true));
  });

  test("each row waits its place in the sequence: the first at once, then 40ms apart", () => {
    render(<ResultsPanel state={ready()} />);
    const places = vi
      .mocked(staggered)
      .mock.calls.filter(([preset]) => preset === listRow)
      .map(([, i]) => i);
    expect([...new Set(places)].sort()).toEqual([0, 1]);
  });

  // Choosing an option re-renders every row (the tint, the bar, the itinerary moving in).
  // None of that is a new set of results, so nothing arrives again.
  test("choosing another option does not replay the arrival", async () => {
    const { rerender } = render(<ResultsPanel state={ready("transit")} />);
    const rows = optionRows();
    await waitFor(() => expect(rows.every(atRest)).toBe(true));

    rerender(<ResultsPanel state={ready("bike")} />);

    // The same elements, not equal ones: toEqual would compare DOM nodes by structure.
    const after = optionRows();
    expect(after).toHaveLength(rows.length);
    after.forEach((row, i) => expect(row).toBe(rows[i]));
    for (const row of after) expect(atRest(row)).toBe(true);
    expect(after.find((r) => r.dataset.selected === "true")).toHaveTextContent("By bike");
  });

  // The same rows for a new search are still a new set: the departures in them are new.
  test("a new search brings its results in again, even when they look the same", async () => {
    const { rerender } = render(<ResultsPanel state={ready("transit", () => {}, "first search")} />);
    const first = optionRows();
    await waitFor(() => expect(first.every(atRest)).toBe(true));

    rerender(<ResultsPanel state={ready("transit", () => {}, "second search")} />);

    const second = optionRows();
    expect(second).toHaveLength(first.length);
    for (const row of second) {
      expect(first).not.toContain(row);
      expect(row.style.opacity).toBe("0");
    }
    await waitFor(() => expect(second.every(atRest)).toBe(true));
  });

  // The skeleton is the one thing in the panel that leaves with motion. It fades over
  // the results that replace it rather than ahead of them: out of the flow from the
  // first frame, so nothing under it moves when it goes, and out of reach, so a tap on
  // a row that has just arrived lands on the row.
  test("the skeleton fades out over the results, out of the flow and out of reach", async () => {
    const { rerender } = render(<ResultsPanel state={{ status: "loading" }} />);
    const skeleton = document.querySelector<HTMLElement>('[data-fov="results-skeleton"]')!;
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).not.toHaveClass("absolute");
    expect(skeleton).not.toHaveAttribute("inert");

    rerender(<ResultsPanel state={ready()} />);

    expect(optionRows()).toHaveLength(2);
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass("absolute", "inset-x-0", "top-0");
    expect(skeleton).toHaveAttribute("inert", "");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton.style.pointerEvents).toBe("none");
    await waitForExit(skeleton);
  });

  test("a plan that fails takes the skeleton's place the same way", async () => {
    const { rerender } = render(<ResultsPanel state={{ status: "loading" }} />);
    const skeleton = document.querySelector<HTMLElement>('[data-fov="results-skeleton"]')!;
    rerender(<ResultsPanel state={{ status: "error", message: "no bike route found" }} />);
    expect(screen.getByText("no bike route found")).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("inert", "");
    await waitForExit(skeleton);
  });

  // The other surfaces of the panel arrive the way the overlays do: a fade and an 8px
  // rise over `base`.
  test.each([
    ["the idle prompt", () => <ResultsPanel state={{ status: "idle" }} />, () => screen.getByText(/enter origin and destination/i)],
    [
      "the error card",
      () => <ResultsPanel state={{ status: "error", message: "no bike route found" }} />,
      () => screen.getByText("no bike route found"),
    ],
    [
      "the empty state",
      () => (
        <ResultsPanel
          state={{ ...ready(), view: { ...buildPlanView(mockPlanFor("A", "Bijlmer rain")), options: [] } }}
        />
      ),
      () => screen.getByText(/no options match/i),
    ],
    [
      "the advice banner",
      () => <ResultsPanel state={ready()} />,
      () => document.querySelector<HTMLElement>('[data-fov="weather-banner"]')!,
    ],
  ])("%s fades and rises 8px into place", async (_, ui, find) => {
    render(ui());
    const el = find();
    expect(el.style.opacity).toBe("0");
    expect(el.style.transform).toBe("translateY(8px)");
    await waitFor(() => expect(atRest(el)).toBe(true));
  });

  // Over the options it leads the sequence; under them on a phone it follows the last
  // row instead of arriving with the first.
  test("the advice banner takes its place in the sequence", () => {
    const { unmount } = render(<ResultsPanel state={ready()} />);
    expect(vi.mocked(staggered)).toHaveBeenCalledWith(overlay, 0);
    unmount();
    vi.mocked(staggered).mockClear();
    render(<ResultsPanel state={ready()} narrow />);
    expect(vi.mocked(staggered)).toHaveBeenCalledWith(overlay, 2);
  });

  // Reduced motion allows a short fade and nothing that moves.
  test("under reduced motion nothing in the panel moves, on any frame", async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { rerender } = render(<ResultsPanel state={{ status: "idle" }} />);
    const prompt = screen.getByText(/enter origin and destination/i);
    expect(prompt.style.transform).toBe("");

    rerender(<ResultsPanel state={ready()} narrow />);
    const moving = [...optionRows(), document.querySelector<HTMLElement>('[data-fov="weather-banner"]')!];
    for (const el of moving) {
      expect(el.style.opacity).toBe("0");
      expect(el.style.transform).toBe("");
    }
    await waitFor(() => expect(moving.every((el) => el.style.opacity === "1")).toBe(true));
    for (const el of moving) expect(el.style.transform).toBe("");
  });
});

// The two disclosures in the results ("Step by step" on a phone, and the note on how the
// figures are worked out) open and close by height, in CSS alone. jsdom has no
// stylesheet and no layout, so what it can hold is the rule and who wears it; the
// motion itself is looked at in a real browser.
describe("the disclosures", () => {
  const css = readFileSync(join(ROOT, "src", "index.css"), "utf8");

  test("both wear the class the rule is written for", () => {
    render(<ResultsPanel state={ready()} narrow />);
    const all = [...document.querySelectorAll("details")];
    expect(all).toHaveLength(2);
    for (const d of all) expect(d).toHaveClass("disclosure");
  });

  test("open and close over `base` with the enter curve, where the browser can animate a height to auto", () => {
    const supports = css.match(/@supports \(interpolate-size: allow-keywords\) \{([\s\S]*?)\n\}/);
    expect(supports, "the @supports block").not.toBeNull();
    const body = supports![1];
    expect(body).toMatch(/\.disclosure\s*\{[^}]*interpolate-size:\s*allow-keywords;/);
    const content = body.match(/\.disclosure::details-content\s*\{([^}]*)\}/);
    expect(content, "the ::details-content rule").not.toBeNull();
    expect(content![1]).toMatch(/block-size:\s*0;/);
    expect(content![1]).toMatch(
      /transition:\s*block-size theme\("transitionDuration\.base"\) theme\("transitionTimingFunction\.enter"\),\s*content-visibility theme\("transitionDuration\.base"\) theme\("transitionTimingFunction\.enter"\) allow-discrete;/,
    );
    expect(body).toMatch(/\.disclosure\[open\]::details-content\s*\{[^}]*block-size:\s*auto;/);
  });

  // `*` in the global reduced-motion rule does not reach ::details-content.
  test("open at once under reduced motion, in a rule of their own", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.disclosure::details-content\s*\{\s*transition:\s*none;\s*\}\s*\}/,
    );
  });
});
