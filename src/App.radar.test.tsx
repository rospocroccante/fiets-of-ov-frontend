import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { whenMapMounted } from "./test/mapReady";
import { morphTo, phoneViewport, stubHeights } from "./test/phone";

// The rain radar as the app drives it: a round button on a phone's map, the inline
// segment on a desktop's filter bar, and the radar turning itself on when a plan expects
// rain during the trip.

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// A recent trip to a "zuid" destination: the mock planner expects rain on it.
function seedRainyTrip() {
  window.localStorage.setItem(
    "fov.recentTrips.v1",
    JSON.stringify([
      {
        fromLabel: "Amsterdam Centraal",
        fromQuery: "Amsterdam Centraal",
        toLabel: "Zuidplein",
        toQuery: "Zuidplein",
        at: Date.now() - 60_000,
      },
    ]),
  );
}

let restore: Array<() => void> = [];
afterEach(() => {
  for (const r of restore.reverse()) r();
  restore = [];
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

function phone(opts?: { landscape?: boolean }) {
  restore.push(phoneViewport(opts));
}

const floating = () => document.querySelector('[data-fov="radar-button"]') as HTMLElement | null;
// The map's own wrapper: the readout (with its Rain and Wind toggles) lives in it.
const mapWrap = () => document.querySelector(".leaflet-container")!.parentElement as HTMLElement;
const readoutShown = () => within(mapWrap()).queryByRole("button", { name: "Rain" }) !== null;
const summary = () => document.querySelector('[data-fov="sheet-summary"]') as HTMLElement;
const sheet = () => document.querySelector('[data-fov="results-sheet"]') as HTMLElement;

// The seeded recent trip, on the home. Once a trip is planned the search pill names it
// too, so the row is looked for on the home stage alone.
const rainyRow = () =>
  within(document.querySelector('[data-fov="home-stage"]') as HTMLElement).getByRole("button", { name: /Zuidplein/ });

async function planRainy() {
  fireEvent.click(rainyRow());
  await waitFor(() => expect(screen.getAllByText("Rain expected").length).toBeGreaterThan(0));
}

async function planDry() {
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await waitFor(() => expect(screen.getAllByText("Dry").length).toBeGreaterThan(0));
}

// A few renders' worth of time, for anything an effect might still do.
async function idle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

test("on a portrait phone the radar is a round button on the map, and it turns the map's radar on and off", async () => {
  phone();
  renderApp();
  await whenMapMounted();
  await morphTo(1);

  const b = floating();
  expect(b).not.toBeNull();
  // The one Radar control on the layout: the chip row's Map menu no longer has one.
  expect(screen.getByRole("button", { name: "Radar" })).toBe(b);
  expect(b).toHaveAttribute("aria-pressed", "false");
  // A round 48px button with the reset's white surface and shadow, its icon an inline
  // SVG rather than a glyph from the frozen icon font.
  expect(b).toHaveClass("h-12", "w-12", "rounded-full", "shadow-md", "bg-white", "dark:bg-night-raised");
  expect(b!.className).not.toMatch(/dark:(bg|border)-white/);
  expect(b!.querySelector("svg")).not.toBeNull();
  expect(b!.querySelector(".material-symbols-rounded")).toBeNull();
  // On the map stage, outside the chip row, in the right-hand corner and 12px under the
  // floating chrome (whose inset is 0 in jsdom, which has no layout).
  expect(b!.closest('[data-fov="map-stage"]')).not.toBeNull();
  expect(b!.closest('[data-fov="map-chrome"]')).toBeNull();
  expect(b).toHaveClass("absolute", "right-3");
  expect(b!.style.top).toBe("12px");
  expect(readoutShown()).toBe(false);

  fireEvent.click(b!);
  expect(b).toHaveAttribute("aria-pressed", "true");
  // On, it is filled: brand by day, the night accent at night.
  const fill = b!.querySelector('[data-fov="radar-fill"]');
  expect(fill).toHaveClass("bg-brand", "dark:bg-night-accent");
  await waitFor(() => expect(readoutShown()).toBe(true));

  fireEvent.click(b!);
  expect(b).toHaveAttribute("aria-pressed", "false");
  expect(b!.querySelector('[data-fov="radar-fill"]')).toBeNull();
  await waitFor(() => expect(readoutShown()).toBe(false));
});

test("a phone on its side gets the same button, in the top-right corner of the map pane", async () => {
  phone({ landscape: true });
  renderApp();
  await whenMapMounted();
  await morphTo(1);

  const b = floating();
  expect(b).not.toBeNull();
  expect(screen.getByRole("button", { name: "Radar" })).toBe(b);
  expect(b).toHaveClass("absolute", "right-3", "h-12", "w-12");
  expect(b!.style.top).toBe("12px");
  // In the map's pane, beside the results column rather than in it.
  expect(b!.closest('[data-fov="results-column"]')).toBeNull();
  expect(b!.parentElement).toContainElement(mapWrap());

  fireEvent.click(b!);
  await waitFor(() => expect(readoutShown()).toBe(true));
  fireEvent.click(b!);
  await waitFor(() => expect(readoutShown()).toBe(false));
});

test("the phone's Map menu keeps its tools and has no radar in it", async () => {
  phone();
  renderApp();
  await morphTo(1);
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  const panel = document.querySelector('[data-fov="filter-panel"]') as HTMLElement;
  for (const name of [/^start$/i, /^end$/i, /hide map/i]) {
    expect(within(panel).getByRole("button", { name })).toBeInTheDocument();
  }
  expect(within(panel).queryByRole("button", { name: "Radar" })).toBeNull();
});

test("on desktop the radar stays an inline segment of the filter bar, and nothing floats on the map", async () => {
  renderApp();
  await whenMapMounted();
  await morphTo(1);
  expect(floating()).toBeNull();
  const bar = document.querySelector('[data-fov="filter-bar"]') as HTMLElement;
  const segment = within(bar).getByRole("button", { name: "Radar" });
  expect(segment).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(segment);
  expect(segment).toHaveAttribute("aria-pressed", "true");
  await waitFor(() => expect(readoutShown()).toBe(true));
});

test("a plan that expects rain during the trip turns the radar on by itself", async () => {
  phone();
  seedRainyTrip();
  renderApp();
  await planRainy();
  await whenMapMounted();
  await morphTo(1);
  const b = floating()!;
  expect(b).toHaveAttribute("aria-pressed", "true");
  // The one cue that it was the plan, not the rider: the fill arrives with the overlay
  // preset, which the button says it is playing.
  expect(b).toHaveAttribute("data-cue", "auto");
  expect(b.querySelector('[data-fov="radar-fill"]')).not.toBeNull();
  await waitFor(() => expect(readoutShown()).toBe(true));
});

// The readout's layer toggles say which layers the map was given.
const layerPressed = (name: "Rain" | "Wind") =>
  within(mapWrap()).getByRole("button", { name }).getAttribute("aria-pressed");

// The owner's call: a radar the plan turned on shows the rain alone. The wind particles
// cost battery and data the rider did not ask for.
test("a plan that turns the radar on gives the map the rain layer alone, and the Wind toggle still adds wind", async () => {
  phone();
  seedRainyTrip();
  renderApp();
  await planRainy();
  await whenMapMounted();
  await morphTo(1);
  expect(floating()).toHaveAttribute("data-cue", "auto");
  await waitFor(() => expect(readoutShown()).toBe(true));
  expect(layerPressed("Rain")).toBe("true");
  expect(layerPressed("Wind")).toBe("false");

  fireEvent.click(within(mapWrap()).getByRole("button", { name: "Wind" }));
  await waitFor(() => expect(layerPressed("Wind")).toBe("true"));
  expect(layerPressed("Rain")).toBe("true");
});

test("the rider's own tap still turns on rain and wind, after a plan's turn-on as well", async () => {
  phone();
  seedRainyTrip();
  renderApp();
  await planDry();
  await whenMapMounted();
  await morphTo(1);
  fireEvent.click(floating()!);
  await waitFor(() => expect(readoutShown()).toBe(true));
  expect(layerPressed("Rain")).toBe("true");
  expect(layerPressed("Wind")).toBe("true");

  // A plan's turn-on, then the rider's off and on: the rider's tap brings both back.
  fireEvent.click(floating()!);
  await waitFor(() => expect(readoutShown()).toBe(false));
  await morphTo(0);
  await planRainy();
  await morphTo(1);
  await waitFor(() => expect(floating()).toHaveAttribute("data-cue", "auto"));
  await waitFor(() => expect(readoutShown()).toBe(true));
  expect(layerPressed("Wind")).toBe("false");
  fireEvent.click(floating()!);
  await waitFor(() => expect(readoutShown()).toBe(false));
  fireEvent.click(floating()!);
  await waitFor(() => expect(readoutShown()).toBe(true));
  expect(layerPressed("Rain")).toBe("true");
  expect(layerPressed("Wind")).toBe("true");
});

test("a dry plan neither turns the radar on nor turns it off", async () => {
  phone();
  renderApp();
  await planDry();
  await whenMapMounted();
  await morphTo(1);
  const b = floating()!;
  await idle();
  expect(b).toHaveAttribute("aria-pressed", "false");

  // On by hand, then another dry search: it stays on.
  fireEvent.click(b);
  expect(b).toHaveAttribute("aria-pressed", "true");
  expect(b).not.toHaveAttribute("data-cue");
  await morphTo(0);
  await planDry();
  await morphTo(1);
  await idle();
  expect(floating()).toHaveAttribute("aria-pressed", "true");
});

test("turned off by the rider, the radar stays off for that search; a new search can turn it on again", async () => {
  phone();
  seedRainyTrip();
  renderApp();
  await planRainy();
  await whenMapMounted();
  await morphTo(1);
  const b = floating()!;
  expect(b).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(b);
  expect(b).toHaveAttribute("aria-pressed", "false");
  expect(b).not.toHaveAttribute("data-cue");
  // The same search, re-rendered every way the screen can be: another option chosen, a
  // filter chip off and on, the sheet moved. None of it is a new search.
  fireEvent.click(within(summary()).getByRole("button", { name: /public transport, 29 min/i }));
  const transit = within(document.querySelector('[data-fov="filter-bar"]') as HTMLElement).getByRole("button", {
    name: "Transit",
  });
  fireEvent.click(transit);
  fireEvent.click(transit);
  await idle();
  expect(b).toHaveAttribute("aria-pressed", "false");
  // A language switch rebuilds the plan's view without fetching it again: the same
  // search, in Dutch.
  await morphTo(0);
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  fireEvent.click(screen.getByRole("button", { name: "Nederlands" }));
  fireEvent.click(screen.getByRole("button", { name: "Plan" }));
  await morphTo(1);
  await waitFor(() => expect(screen.getAllByText("Regen op komst").length).toBeGreaterThan(0));
  await idle();
  expect(b).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => expect(readoutShown()).toBe(false));

  // The same trip searched again is a new search, and it may turn the radar on again.
  await morphTo(0);
  fireEvent.click(rainyRow());
  await morphTo(1);
  await waitFor(() => expect(floating()).toHaveAttribute("aria-pressed", "true"));
  expect(floating()).toHaveAttribute("data-cue", "auto");
});

test("on desktop a rainy plan turns the inline segment on as well", async () => {
  seedRainyTrip();
  renderApp();
  await planRainy();
  const bar = document.querySelector('[data-fov="filter-bar"]') as HTMLElement;
  await waitFor(() => expect(within(bar).getByRole("button", { name: "Radar" })).toHaveAttribute("aria-pressed", "true"));
});

test("a full sheet, which hides the map, takes the button away with it", async () => {
  phone();
  restore.push(stubHeights({ "sheet-frame": 700, "sheet-head": 160, "sheet-body": 900 }));
  renderApp();
  await planDry();
  await morphTo(1);
  const b = floating()!;
  expect(sheet()).toHaveAttribute("data-detent", "peek");
  expect(b).not.toHaveAttribute("inert");

  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  expect(b).not.toHaveAttribute("inert");
  expect(b.style.opacity).toBe("1");

  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "full");
  expect(b).toHaveAttribute("inert");
  expect(b.style.opacity).toBe("0");
  expect(b.style.pointerEvents).toBe("none");

  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "peek");
  expect(b).not.toHaveAttribute("inert");
});

test("navigation keeps the button on a portrait phone, and puts it away on a phone on its side", async () => {
  phone();
  const { unmount } = renderApp();
  await planDry();
  await morphTo(1);
  fireEvent.click(within(summary()).getByRole("button", { name: "Start navigation" }));
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  // The banner ends above the chip row's place, and the button is under that.
  expect(floating()).not.toHaveAttribute("inert");
  unmount();
  for (const r of restore.reverse()) r();
  restore = [];
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });

  // On its side the banner spans the top of the map pane, where the button would cover
  // its Exit.
  phone({ landscape: true });
  renderApp();
  await planDry();
  await morphTo(1);
  fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  expect(floating()).toHaveAttribute("inert");
  expect(floating()!.style.opacity).toBe("0");
});
