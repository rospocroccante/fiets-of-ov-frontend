import { render, screen, fireEvent } from "@testing-library/react";
import { AdviceCard } from "./AdviceCard";
import { I18nProvider } from "../lib/i18n";
import { buildPlanView } from "../lib/planView";
import type { OptionView } from "../lib/planView";
import { chipInk, modeColor } from "../lib/modeColors";
import { mockPlanFor } from "../api/mock";
import type { Itinerary } from "../api/types";
import { glassClasses } from "../test/glass";

// The Dutch test writes the language into localStorage, which outlives the test that
// wrote it. Clearing it in the test body only clears it when that test passes; a
// failure would leave the next reader of the store in Dutch.
afterEach(() => {
  window.localStorage.clear();
});

const itinerary: Itinerary = {
  minutes: 24,
  distance_m: 4750,
  start_time: 0,
  end_time: 0,
  legs: [],
};

const recommended: OptionView = {
  mode: "bike",
  title: "By bike",
  minutes: 24,
  distanceKm: 4.8,
  recommended: true,
  summary: "4.8 km by bike",
  rainMinutes: 0,
  metrics: { fareEur: 0, kcal: 187, co2Grams: 0, co2Complete: true },
  itinerary,
};

const transit: OptionView = {
  ...recommended,
  mode: "transit",
  title: "Public transport",
  minutes: 29,
  distanceKm: null,
  recommended: false,
  summary: "Metro 52 -> Tram 1",
  rainMinutes: 0,
  metrics: { fareEur: 2.34, kcal: 45, co2Grams: 96, co2Complete: true },
};

test("shows the Best tag, title and minutes", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByText("Best")).toBeInTheDocument();
  expect(screen.getByText("By bike")).toBeInTheDocument();
  expect(screen.getByText("24 min")).toBeInTheDocument();
});

test("no tag when not recommended", () => {
  render(
    <AdviceCard option={{ ...recommended, recommended: false }} selected={false} onSelect={() => {}} />
  );
  expect(screen.queryByText("Best")).not.toBeInTheDocument();
});

test("the selected toggle is pressed", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
});

// The row is also the disclosure for its own itinerary, which is what makes choosing an
// option and reading it the same place instead of a card above a list somewhere below.
test("the chosen row says it is expanded and names the itinerary it opens", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} detailsId="fov-option-bike" />);
  const row = screen.getByRole("button");
  expect(row).toHaveAttribute("aria-expanded", "true");
  expect(row).toHaveAttribute("aria-controls", "fov-option-bike");
});

test("a row that is not chosen is not expanded and controls nothing", () => {
  render(
    <AdviceCard option={recommended} selected={false} onSelect={() => {}} detailsId="fov-option-bike" />,
  );
  const row = screen.getByRole("button");
  expect(row).toHaveAttribute("aria-expanded", "false");
  expect(row).not.toHaveAttribute("aria-controls");
});

// The route is what tells the two transit options apart at a glance; it used to live on
// a separate line under all three cards, describing only whichever was selected.
test("the row carries the route it stands for", () => {
  render(<AdviceCard option={transit} selected={false} onSelect={() => {}} />);
  expect(screen.getByText("Metro 52 -> Tram 1")).toBeInTheDocument();
});

test("calls onSelect when clicked", () => {
  const onSelect = vi.fn();
  render(<AdviceCard option={recommended} selected={false} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test("shows fare, calories, CO2 and rain exposure for a transit option", () => {
  render(<AdviceCard option={transit} selected={false} onSelect={() => {}} />);
  // The fare is money the user has not been quoted, so it never reads as a price.
  expect(screen.getByText(/€2\.34/)).toHaveTextContent("≈");
  expect(screen.getByLabelText(/estimated fare/i)).toBeInTheDocument();
  expect(screen.getByText("45 kcal")).toBeInTheDocument();
  expect(screen.getByText("96 g CO2")).toBeInTheDocument();
  expect(screen.getByText("No rain")).toBeInTheDocument();
});

test("a bike option is free rather than zero euros, and emits nothing", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByText("Free")).toBeInTheDocument();
  expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  expect(screen.getByText("0 g CO2")).toBeInTheDocument();
  expect(screen.getByText("187 kcal")).toBeInTheDocument();
});

// A total that leaves a leg out is not the same claim as a total that counts them all,
// and until now the row printed both in the same three words. The live case is the IJ
// ferry: no Dutch source publishes an emission factor for a city ferry, so a bike trip
// that crosses it reads "0 g CO2" exactly like one that does not.
test("an incomplete CO2 total is marked as a floor on the row itself", () => {
  render(
    <AdviceCard
      option={{ ...recommended, metrics: { ...recommended.metrics, co2Complete: false } }}
      selected
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText("≥ 0 g CO2")).toBeInTheDocument();
  expect(screen.queryByText("0 g CO2")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/at least 0 grams .* no published emission factor/i)).toBeInTheDocument();
});

test("a complete CO2 total carries no floor mark", () => {
  render(<AdviceCard option={transit} selected={false} onSelect={() => {}} />);
  expect(screen.getByText("96 g CO2")).toBeInTheDocument();
  expect(screen.queryByText(/≥/)).not.toBeInTheDocument();
});

test("the floor mark is Dutch in a Dutch session", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  render(
    <I18nProvider>
      <AdviceCard
        option={{ ...transit, metrics: { ...transit.metrics, co2Complete: false } }}
        selected={false}
        onSelect={() => {}}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("≥ 96 g CO2")).toBeInTheDocument();
  expect(screen.getByLabelText(/minstens 96 gram CO2/i)).toBeInTheDocument();
});

test("minutes in the rain are named as such", () => {
  render(<AdviceCard option={{ ...recommended, rainMinutes: 22 }} selected onSelect={() => {}} />);
  expect(screen.getByText("22 min in rain")).toBeInTheDocument();
});

test("an unavailable forecast says so instead of claiming a dry ride", () => {
  render(<AdviceCard option={{ ...recommended, rainMinutes: null }} selected onSelect={() => {}} />);
  expect(screen.queryByText("No rain")).not.toBeInTheDocument();
  expect(screen.getByText("Rain unknown")).toBeInTheDocument();
});

test("a fare that cannot be estimated says so instead of showing zero", () => {
  render(
    <AdviceCard
      option={{ ...transit, metrics: { ...transit.metrics, fareEur: null } }}
      selected={false}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText("No estimate")).toBeInTheDocument();
  expect(screen.queryByText("Free")).not.toBeInTheDocument();
});

test("the metrics are Dutch in a Dutch session, money included", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  render(
    <I18nProvider>
      <AdviceCard option={{ ...transit, rainMinutes: 12 }} selected={false} onSelect={() => {}} />
    </I18nProvider>,
  );
  // nl-NL writes the decimal with a comma; the approximation mark stays.
  expect(screen.getByText(/2,34/)).toHaveTextContent("≈");
  expect(screen.getByText("45 kcal")).toBeInTheDocument();
  expect(screen.getByText("96 g CO2")).toBeInTheDocument();
  expect(screen.getByText("12 min in de regen")).toBeInTheDocument();
});

// The leg bar. One segment per leg, as wide as that leg's share of the minutes, in the
// colour the leg has on the map and on its step-by-step chip, with the ink that fill
// can carry. jsdom has no layout, so widths are measured in browser-tests/; what it can
// read is that every segment is wired to the right numbers and the right colours. That
// chipInk clears AA on every mode colour is pinned in ItineraryDetails.test.tsx.
describe("the leg bar", () => {
  const mixed = buildPlanView(mockPlanFor("A", "Zuid"));
  const bikeAndRide = mixed.options.find((o) => o.mode === "bike_and_ride")!;
  const transitMixed = mixed.options.find((o) => o.mode === "transit")!;

  function segments(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>('[data-fov="leg-segment"]')];
  }
  // Thin space, middle dot, thin space between a name and its minutes.
  const dot = "\u2009\u00b7\u2009";

  test("draws one segment per leg, grown by its minutes and filled with its mode colour", () => {
    const { container } = render(<AdviceCard option={transitMixed} selected={false} onSelect={() => {}} />);
    const legs = transitMixed.itinerary.legs;
    const segs = segments(container);
    expect(segs).toHaveLength(legs.length);
    segs.forEach((seg, i) => {
      const fill = modeColor(legs[i].mode);
      expect(seg).toHaveStyle({ flexGrow: String(legs[i].minutes), backgroundColor: fill, color: chipInk(fill) });
    });
  });

  test("labels each segment with its mode or line and its minutes, a walk with minutes alone", () => {
    const { container } = render(<AdviceCard option={bikeAndRide} selected onSelect={() => {}} />);
    expect(segments(container).map((s) => s.textContent)).toEqual([`Bike${dot}6`, `M52${dot}7`, "4"]);
    const transit = render(<AdviceCard option={transitMixed} selected={false} onSelect={() => {}} />);
    expect(segments(transit.container).map((s) => s.textContent)).toEqual(["4", `M52${dot}8`, "3", `Tram 1${dot}9`, "5"]);
  });

  test("the labels are Dutch in a Dutch session", () => {
    window.localStorage.setItem("fov.lang.v1", "nl");
    const nl = buildPlanView(mockPlanFor("A", "Zuid"), "nl").options.find((o) => o.mode === "bike_and_ride")!;
    const { container } = render(
      <I18nProvider>
        <AdviceCard option={nl} selected onSelect={() => {}} />
      </I18nProvider>,
    );
    expect(segments(container).map((s) => s.textContent)).toEqual([`Fiets${dot}6`, `M52${dot}7`, "4"]);
  });

  test("is hidden from assistive tech, which reads the route in words instead", () => {
    const { container } = render(<AdviceCard option={transitMixed} selected={false} onSelect={() => {}} />);
    const bar = container.querySelector('[data-fov="leg-bar"]')!;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    // The written route stays in the row: off the screen, because the bar draws it,
    // and in the button's accessible name.
    const summary = screen.getByText("Metro 52 -> Tram 1");
    expect(summary).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: /Metro 52 -> Tram 1/ })).toBeInTheDocument();
  });

  test("an itinerary with no legs draws no bar and keeps its route on screen", () => {
    const { container } = render(<AdviceCard option={transit} selected={false} onSelect={() => {}} />);
    expect(container.querySelector('[data-fov="leg-bar"]')).toBeNull();
    expect(screen.getByText("Metro 52 -> Tram 1")).not.toHaveClass("sr-only");
  });

  test("a label that cannot fit wraps out of its segment whole instead of being cut", () => {
    const { container } = render(<AdviceCard option={transitMixed} selected={false} onSelect={() => {}} />);
    for (const seg of segments(container)) {
      // A one-line wrapping row as tall as the bar, clipped: a strut that holds the
      // line open, and a label that never breaks inside itself.
      expect(seg).toHaveClass("flex-wrap", "overflow-hidden", "h-[22px]", "min-w-[4px]", "basis-0");
      const [strut, label] = [...seg.children];
      expect(strut).toHaveClass("w-0", "h-[22px]");
      expect(label).toHaveClass("whitespace-nowrap", "text-[11px]", "font-bold");
    }
  });
});

test("the header puts the total on the right, large, and the Best tag is a tag", () => {
  render(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByText("24 min")).toHaveClass("text-xl", "font-bold", "tabular-nums", "whitespace-nowrap");
  const best = screen.getByText("Best");
  expect(best).toHaveClass("rounded-md", "font-bold");
  expect(best).not.toHaveClass("rounded-full");
  // At night the signage pairing, never the translucent accent-deep that read olive.
  expect(best).toHaveClass("dark:bg-night-accent", "dark:text-night-bg");
  expect(best.className).not.toMatch(/accent-deep/);
});

test("the row wears no glass, and a pointer only tints the row it is not on yet", () => {
  const { container, rerender } = render(<AdviceCard option={recommended} selected={false} onSelect={() => {}} />);
  expect(glassClasses(container)).toEqual([]);
  expect(screen.getByRole("button")).toHaveClass("hover:bg-slate-900/5", "dark:hover:bg-night-hover/60");
  rerender(<AdviceCard option={recommended} selected onSelect={() => {}} />);
  expect(screen.getByRole("button").className).not.toMatch(/hover:bg-/);
});
