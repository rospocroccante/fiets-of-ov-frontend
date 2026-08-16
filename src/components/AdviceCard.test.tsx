import { render, screen, fireEvent } from "@testing-library/react";
import { AdviceCard } from "./AdviceCard";
import { I18nProvider } from "../lib/i18n";
import type { OptionView } from "../lib/planView";
import type { Itinerary } from "../api/types";

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
