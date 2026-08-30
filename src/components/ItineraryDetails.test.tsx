import { render, screen } from "@testing-library/react";
import { ItineraryDetails, chipInk } from "./ItineraryDetails";
import { mockPlanFor } from "../api/mock";
import { MODE_COLORS, modeColor } from "../lib/modeColors";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The chips are filled with the leg's own line colour so a route reads the same here as
// on the map, which means the fill cannot move and the ink has to. White on the walking
// grey measured 2.56:1 and on the bike green 3.77:1 — both well under AA at 12px.
test("every mode's leg chip clears AA with the ink chosen for its fill", () => {
  const fills = [...Object.values(MODE_COLORS), modeColor("SOMETHING_NEW")];
  for (const fill of fills) {
    expect(contrast(chipInk(fill), fill), `ink on ${fill}`).toBeGreaterThanOrEqual(4.5);
  }
});

test("the ink is the better of the two, not a fixed choice", () => {
  // A fill light enough to need dark ink, and one dark enough to need white.
  expect(chipInk("#94a3b8")).toBe("#111827");
  expect(chipInk("#4f46e5")).toBe("#ffffff");
});

// Both halves of the pair are inline styles, so this is one of the few colour facts
// jsdom can actually read: the chip has to be wired to chipInk, not merely able to
// call it. Contrast is measured for real in browser-tests/specs/results.checks.mjs.
test("each chip is painted with its own mode colour and that colour's ink", () => {
  const plan = mockPlanFor("A", "Bijlmer rain");
  const itinerary = plan.options.find((o) => o.kind === "transit")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  const walk = screen.getAllByText("Walk")[0];
  const metro = screen.getByText("Metro 52");
  expect(walk).toHaveStyle({ backgroundColor: modeColor("WALK"), color: chipInk(modeColor("WALK")) });
  expect(metro).toHaveStyle({ backgroundColor: modeColor("SUBWAY"), color: chipInk(modeColor("SUBWAY")) });
  // And the two do not end up with the same ink, which a hard-coded colour would.
  expect(chipInk(modeColor("WALK"))).not.toBe(chipInk(modeColor("SUBWAY")));
});

test("renders transit legs step by step with line badges", () => {
  const plan = mockPlanFor("A", "Bijlmer rain");
  const itinerary = plan.options.find((o) => o.kind === "transit")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByText(/Step by step/)).toBeInTheDocument();
  expect(screen.getByText("Metro 52")).toBeInTheDocument();
  expect(screen.getByText("Tram 1")).toBeInTheDocument();
  expect(screen.getAllByText("Walk").length).toBeGreaterThan(0);
});

test("states what the fare, calorie and CO2 figures assume", () => {
  const plan = mockPlanFor("A", "Bijlmer rain");
  const itinerary = plan.options.find((o) => o.kind === "transit")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByText(/How these figures are worked out/)).toBeInTheDocument();
  // The fare must never read as the price the user will be charged.
  expect(screen.getByText(/what you are charged may differ/i)).toBeInTheDocument();
  // The one omission that pushes the estimate above the real charge is the daily cap,
  // so the footnote has to name it.
  expect(screen.getByText(/GVB Max daily cap of €10\.50/i)).toBeInTheDocument();
  // CO2 with no stated baseline is meaningless; say which direction it points.
  expect(screen.getByText(/what this trip emits, not what it saves/i)).toBeInTheDocument();
  // This itinerary has metro and tram legs with no distance from the planner.
  expect(screen.getByText(/straight line between its stops/i)).toBeInTheDocument();
});

test("a bike itinerary with a real distance does not claim straight-line guesswork", () => {
  const plan = mockPlanFor("A", "Vondelpark");
  const itinerary = plan.options.find((o) => o.kind === "bike")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.queryByText(/straight line between its stops/i)).not.toBeInTheDocument();
});

test("a bike-only itinerary is not explained by GVB's green traction current", () => {
  // Zero grams, and complete, but nothing on this trip runs on electricity. The note
  // belongs to tram and metro legs, and there are none here.
  const plan = mockPlanFor("A", "Vondelpark");
  const itinerary = plan.options.find((o) => o.kind === "bike")!.itinerary;
  expect(itinerary.legs.every((l) => l.mode === "BICYCLE")).toBe(true);
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.queryByText(/green electricity/i)).not.toBeInTheDocument();
});

test("a transit itinerary on tram and metro does explain the zero with green traction current", () => {
  const plan = mockPlanFor("A", "Bijlmer rain");
  const itinerary = plan.options.find((o) => o.kind === "transit")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByText(/green electricity/i)).toBeInTheDocument();
});

test("renders a bike itinerary", () => {
  const plan = mockPlanFor("A", "Vondelpark");
  const itinerary = plan.options.find((o) => o.kind === "bike")!.itinerary;
  render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByText("Bike")).toBeInTheDocument();
});

// The phone folds this panel behind a disclosure whose summary already says "Step by
// step". Drawing the same heading again inside would read as two panels and be
// announced twice, so the caller can turn it off — and the times, which the summary
// does not carry, stay either way.
test("the heading can be left to the disclosure above, and the times stay", () => {
  const itinerary = mockPlanFor("A", "Bijlmer rain").options[0].itinerary;
  const { rerender } = render(<ItineraryDetails itinerary={itinerary} />);
  expect(screen.getByRole("heading", { level: 4, name: "Step by step" })).toBeInTheDocument();

  rerender(<ItineraryDetails itinerary={itinerary} heading={false} />);
  expect(screen.queryByRole("heading", { level: 4 })).not.toBeInTheDocument();
  expect(screen.getByText(/\d\d:\d\d – \d\d:\d\d · \d+ min/)).toBeInTheDocument();
  // The steps themselves are untouched.
  expect(screen.getByText("Metro 52")).toBeInTheDocument();
});
